import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FetchLike } from "../src/api/client.js";
import { MissingApiKeyError, setKeychainProvider } from "../src/auth.js";
import { validateStartupAuth } from "../src/index.js";

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

describe("validateStartupAuth", () => {
  it("calls GET /me with the resolved Bearer key and logs masked success", async () => {
    process.env.BRIGHTY_API_KEY = "super-secret-1234";
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(200, { id: "biz_1", name: "Acme" }),
    );
    const log = vi.fn<(msg: string) => void>();

    await validateStartupAuth({ fetch: fetchImpl, log });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://api.brighty.app/business/v1/accounts");
    const headers = init!.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer super-secret-1234");
    expect(init!.method).toBe("GET");

    expect(log).toHaveBeenCalledTimes(1);
    const logged = log.mock.calls[0]![0];
    expect(logged).toContain("auth OK");
    expect(logged).toContain("***1234");
    expect(logged).not.toContain("super-secret");
  });

  it("throws an actionable error on 401 that includes the masked key", async () => {
    process.env.BRIGHTY_API_KEY = "rotated-old-key-9999";
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(401, { name: "Unauthorized", message: "Invalid token" }),
    );
    const log = vi.fn<(msg: string) => void>();

    const err = await validateStartupAuth({ fetch: fetchImpl, log }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/HTTP 401/);
    expect(msg).toContain("***9999");
    expect(msg).toMatch(/yarn login/);
    expect(msg).toMatch(/brighty-mcp login/);
    expect(msg).toMatch(/npx -y -p @brighty-app\/mcp-server brighty-mcp login/);
    expect(msg).not.toContain("rotated-old-key-9999");
    expect(log).not.toHaveBeenCalled();
  });

  it("propagates non-401 errors verbatim (e.g. 500) without masking-key wrapping", async () => {
    process.env.BRIGHTY_API_KEY = "k-abcd";
    const fetchImpl = vi.fn<FetchLike>(
      async () =>
        new Response("internal explosion", {
          status: 500,
          headers: { "content-type": "text/plain" },
        }),
    );

    const err = await validateStartupAuth({ fetch: fetchImpl }).catch((e) => e);
    expect((err as Error).message).toBe("internal explosion");
  });

  it("surfaces MissingApiKeyError when no key source is available", async () => {
    setKeychainProvider({
      getPassword: async () => null,
      setPassword: async () => undefined,
    });

    const err = await validateStartupAuth({ fetch: vi.fn() as FetchLike }).catch((e) => e);
    expect(err).toBeInstanceOf(MissingApiKeyError);
  });
});
