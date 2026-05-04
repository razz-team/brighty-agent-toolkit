import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FetchLike } from "../src/api/client.js";
import { setKeychainProvider } from "../src/auth.js";
import { runLogin } from "../src/cli/login.js";

const ORIGINAL_BASE_URL = process.env.BRIGHTY_API_URL;
const ORIGINAL_API_KEY = process.env.BRIGHTY_API_KEY;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  delete process.env.BRIGHTY_API_URL;
  delete process.env.BRIGHTY_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_BASE_URL === undefined) delete process.env.BRIGHTY_API_URL;
  else process.env.BRIGHTY_API_URL = ORIGINAL_BASE_URL;
  if (ORIGINAL_API_KEY === undefined) delete process.env.BRIGHTY_API_KEY;
  else process.env.BRIGHTY_API_KEY = ORIGINAL_API_KEY;
  setKeychainProvider(undefined);
});

describe("runLogin", () => {
  it("validates the entered key against /me, saves to keychain, and reports masked success", async () => {
    const prompt = vi.fn(async () => "super-secret-1234");
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, { id: "biz_1" }));
    const save = vi.fn(async () => undefined);
    const log = vi.fn<(msg: string) => void>();
    const errorLog = vi.fn<(msg: string) => void>();

    const result = await runLogin({ prompt, fetch: fetchImpl, save, log, errorLog });

    expect(result).toEqual({ ok: true, maskedKey: "***1234" });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt.mock.calls[0]![0]).toMatch(/Brighty API key/);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://api.brighty.app/business/v1/accounts");
    const headers = init!.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer super-secret-1234");

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("super-secret-1234");

    expect(log).toHaveBeenCalledTimes(1);
    const logged = log.mock.calls[0]![0];
    expect(logged).toContain("saved API key");
    expect(logged).toContain("***1234");
    expect(logged).not.toContain("super-secret");
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("trims whitespace from the prompt input before validating and saving", async () => {
    const prompt = vi.fn(async () => "  padded-key-7777  \n");
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, {}));
    const save = vi.fn(async () => undefined);

    const result = await runLogin({
      prompt,
      fetch: fetchImpl,
      save,
      log: () => undefined,
      errorLog: () => undefined,
    });

    expect(result.ok).toBe(true);
    expect(result.maskedKey).toBe("***7777");
    expect(save).toHaveBeenCalledWith("padded-key-7777");
    const headers = fetchImpl.mock.calls[0]![1]!.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer padded-key-7777");
  });

  it("rejects an empty input without calling the API or keychain", async () => {
    const prompt = vi.fn(async () => "   ");
    const fetchImpl = vi.fn<FetchLike>();
    const save = vi.fn(async () => undefined);
    const errorLog = vi.fn<(msg: string) => void>();

    const result = await runLogin({
      prompt,
      fetch: fetchImpl,
      save,
      log: () => undefined,
      errorLog,
    });

    expect(result).toEqual({ ok: false, errorCode: "empty" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog.mock.calls[0]![0]).toMatch(/no API key/i);
  });

  it("reports a 401 from /me as invalid-key without saving, masking the key in error output", async () => {
    const prompt = vi.fn(async () => "rotated-old-key-9999");
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(401, { name: "Unauthorized", message: "Invalid token" }),
    );
    const save = vi.fn(async () => undefined);
    const errorLog = vi.fn<(msg: string) => void>();

    const result = await runLogin({
      prompt,
      fetch: fetchImpl,
      save,
      log: () => undefined,
      errorLog,
    });

    expect(result).toEqual({
      ok: false,
      maskedKey: "***9999",
      errorCode: "invalid-key",
    });
    expect(save).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledTimes(1);
    const msg = errorLog.mock.calls[0]![0];
    expect(msg).toMatch(/HTTP 401/);
    expect(msg).toContain("***9999");
    expect(msg).not.toContain("rotated-old-key-9999");
  });

  it("reports a non-401 error as network without saving and surfaces the underlying message", async () => {
    const prompt = vi.fn(async () => "k-abcd");
    const fetchImpl = vi.fn<FetchLike>(
      async () =>
        new Response("internal explosion", {
          status: 500,
          headers: { "content-type": "text/plain" },
        }),
    );
    const save = vi.fn(async () => undefined);
    const errorLog = vi.fn<(msg: string) => void>();

    const result = await runLogin({
      prompt,
      fetch: fetchImpl,
      save,
      log: () => undefined,
      errorLog,
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("network");
    expect(save).not.toHaveBeenCalled();
    const msg = errorLog.mock.calls[0]![0];
    expect(msg).toContain("internal explosion");
    expect(msg).toContain("***");
    expect(msg).not.toContain("k-abcd");
  });

  it("honours BRIGHTY_API_URL override when validating the key", async () => {
    process.env.BRIGHTY_API_URL = "https://staging.api.brighty.app";
    const prompt = vi.fn(async () => "staging-key-1111");
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, {}));
    const save = vi.fn(async () => undefined);

    await runLogin({
      prompt,
      fetch: fetchImpl,
      save,
      log: () => undefined,
      errorLog: () => undefined,
    });

    const [url] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://staging.api.brighty.app/accounts");
  });
});
