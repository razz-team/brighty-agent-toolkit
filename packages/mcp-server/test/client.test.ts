import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BrightyApiError,
  BrightyClient,
  DEFAULT_BASE_URL,
  getClient,
  resetClient,
  type FetchLike,
} from "../src/api/client.js";
import { setKeychainProvider } from "../src/auth.js";

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
  resetClient();
});

afterEach(() => {
  if (ORIGINAL_BASE_URL === undefined) delete process.env.BRIGHTY_API_URL;
  else process.env.BRIGHTY_API_URL = ORIGINAL_BASE_URL;
  if (ORIGINAL_API_KEY === undefined) delete process.env.BRIGHTY_API_KEY;
  else process.env.BRIGHTY_API_KEY = ORIGINAL_API_KEY;
  setKeychainProvider(undefined);
  resetClient();
});

describe("BrightyClient.request", () => {
  it("sends Authorization: Bearer with the configured api key", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, { ok: true }));
    const client = new BrightyClient({ apiKey: "test-key", fetch: fetchImpl });

    await client.get("/accounts");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = init!.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer test-key");
    expect(headers.get("accept")).toBe("application/json");
  });

  it("uses BRIGHTY_API_URL env override when no baseUrl is passed", async () => {
    process.env.BRIGHTY_API_URL = "https://staging.api.brighty.app/";
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, {}));
    const client = new BrightyClient({ apiKey: "k", fetch: fetchImpl });

    expect(client.getBaseUrl()).toBe("https://staging.api.brighty.app");
    await client.get("/accounts");
    const [url] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://staging.api.brighty.app/accounts");
  });

  it("falls back to DEFAULT_BASE_URL when env and option are unset", () => {
    const client = new BrightyClient({ apiKey: "k", fetch: vi.fn() as FetchLike });
    expect(client.getBaseUrl()).toBe(DEFAULT_BASE_URL);
  });

  it("constructor option beats env override", () => {
    process.env.BRIGHTY_API_URL = "https://env.example";
    const client = new BrightyClient({
      apiKey: "k",
      baseUrl: "https://opt.example",
      fetch: vi.fn() as FetchLike,
    });
    expect(client.getBaseUrl()).toBe("https://opt.example");
  });

  it("serializes JSON body and sets Content-Type for POST", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, { id: "p1" }));
    const client = new BrightyClient({ apiKey: "k", fetch: fetchImpl });

    await client.post("/payouts", { body: { name: "Run 1" } });

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init!.method).toBe("POST");
    expect(init!.body).toBe(JSON.stringify({ name: "Run 1" }));
    const headers = init!.headers as Headers;
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("forwards Idempotency-Key header when provided", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, {}));
    const client = new BrightyClient({ apiKey: "k", fetch: fetchImpl });

    await client.post("/payouts", { body: { x: 1 }, idempotencyKey: "abc-123" });

    const [, init] = fetchImpl.mock.calls[0]!;
    const headers = init!.headers as Headers;
    expect(headers.get("idempotency-key")).toBe("abc-123");
  });

  it("appends query parameters to the URL", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, []));
    const client = new BrightyClient({
      apiKey: "k",
      baseUrl: "https://api.brighty.app",
      fetch: fetchImpl,
    });

    await client.get("/accounts", { query: { page: 2, status: "ACTIVE", skip: undefined } });

    const [url] = fetchImpl.mock.calls[0]!;
    const u = new URL(String(url));
    expect(u.searchParams.get("page")).toBe("2");
    expect(u.searchParams.get("status")).toBe("ACTIVE");
    expect(u.searchParams.has("skip")).toBe(false);
  });

  it("returns undefined for 204 No Content responses", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response(null, { status: 204 }));
    const client = new BrightyClient({ apiKey: "k", fetch: fetchImpl });

    const result = await client.delete("/accounts/abc");
    expect(result).toBeUndefined();
  });

  it("parses error envelope (description preferred) into BrightyApiError", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(400, {
        name: "ValidationError",
        message: "Bad request",
        description: "Amount must be positive",
      }),
    );
    const client = new BrightyClient({ apiKey: "k", fetch: fetchImpl });

    const err = await client.get("/payouts").catch((e) => e);
    expect(err).toBeInstanceOf(BrightyApiError);
    const apiErr = err as BrightyApiError;
    expect(apiErr.status).toBe(400);
    expect(apiErr.message).toBe("Amount must be positive");
    expect(apiErr.name).toBe("ValidationError");
    expect(apiErr.description).toBe("Amount must be positive");
  });

  it("falls back to message when description is missing", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(401, { name: "Unauthorized", message: "Invalid token" }),
    );
    const client = new BrightyClient({ apiKey: "k", fetch: fetchImpl });

    const err = (await client.get("/me").catch((e) => e)) as BrightyApiError;
    expect(err.message).toBe("Invalid token");
    expect(err.name).toBe("Unauthorized");
  });

  it("falls back to fallback text when envelope is empty", async () => {
    const fetchImpl = vi.fn<FetchLike>(
      async () =>
        new Response("internal explosion", {
          status: 500,
          headers: { "content-type": "text/plain" },
        }),
    );
    const client = new BrightyClient({ apiKey: "k", fetch: fetchImpl });

    const err = (await client.get("/x").catch((e) => e)) as BrightyApiError;
    expect(err.status).toBe(500);
    expect(err.message).toBe("internal explosion");
  });

  it("rejects construction without an api key", () => {
    expect(() => new BrightyClient({ apiKey: "" })).toThrow(/apiKey/);
  });
});

describe("getClient / resetClient", () => {
  it("constructs a client using the resolved api key", async () => {
    process.env.BRIGHTY_API_KEY = "env-key";
    const c1 = await getClient();
    const c2 = await getClient();
    expect(c1).toBe(c2);
  });

  it("resetClient clears the cache", async () => {
    process.env.BRIGHTY_API_KEY = "env-key";
    const c1 = await getClient();
    resetClient();
    const c2 = await getClient();
    expect(c1).not.toBe(c2);
  });
});
