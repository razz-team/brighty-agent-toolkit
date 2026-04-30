import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  KEYCHAIN_ACCOUNT,
  KEYCHAIN_SERVICE,
  MissingApiKeyError,
  getApiKey,
  maskApiKey,
  saveApiKey,
  setKeychainProvider,
  type KeychainProvider,
} from "../src/auth.js";

const ORIGINAL_ENV = process.env.BRIGHTY_API_KEY;

function fakeKeychain(initial: Record<string, string> = {}): KeychainProvider & {
  store: Record<string, string>;
  getPassword: ReturnType<typeof vi.fn>;
  setPassword: ReturnType<typeof vi.fn>;
} {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    getPassword: vi.fn(async (service: string, account: string) => {
      return store[`${service}:${account}`] ?? null;
    }),
    setPassword: vi.fn(async (service: string, account: string, password: string) => {
      store[`${service}:${account}`] = password;
    }),
  };
}

beforeEach(() => {
  delete process.env.BRIGHTY_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.BRIGHTY_API_KEY;
  else process.env.BRIGHTY_API_KEY = ORIGINAL_ENV;
  setKeychainProvider(undefined);
});

describe("getApiKey", () => {
  it("returns the BRIGHTY_API_KEY env value when set", async () => {
    process.env.BRIGHTY_API_KEY = "env-key";
    const keychain = fakeKeychain({
      [`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`]: "keychain-key",
    });
    setKeychainProvider(keychain);

    await expect(getApiKey()).resolves.toBe("env-key");
    expect(keychain.getPassword).not.toHaveBeenCalled();
  });

  it("trims whitespace from env values", async () => {
    process.env.BRIGHTY_API_KEY = "  env-key  ";
    setKeychainProvider(fakeKeychain());

    await expect(getApiKey()).resolves.toBe("env-key");
  });

  it("falls back to keychain when env is unset", async () => {
    const keychain = fakeKeychain({
      [`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`]: "keychain-key",
    });
    setKeychainProvider(keychain);

    await expect(getApiKey()).resolves.toBe("keychain-key");
    expect(keychain.getPassword).toHaveBeenCalledWith(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  });

  it("ignores empty env value and falls through to keychain", async () => {
    process.env.BRIGHTY_API_KEY = "   ";
    const keychain = fakeKeychain({
      [`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`]: "keychain-key",
    });
    setKeychainProvider(keychain);

    await expect(getApiKey()).resolves.toBe("keychain-key");
  });

  it("throws an actionable MissingApiKeyError when neither source provides a key", async () => {
    setKeychainProvider(fakeKeychain());

    const err = await getApiKey().catch((e) => e);
    expect(err).toBeInstanceOf(MissingApiKeyError);
    expect((err as Error).message).toMatch(/BRIGHTY_API_KEY/);
    expect((err as Error).message).toMatch(/yarn login/);
    expect((err as Error).message).toMatch(/brighty-mcp login/);
    expect((err as Error).message).toMatch(/npx -y -p @brighty-app\/mcp-server brighty-mcp login/);
  });
});

describe("saveApiKey", () => {
  it("stores into the keychain under the expected service/account", async () => {
    const keychain = fakeKeychain();
    setKeychainProvider(keychain);

    await saveApiKey("new-key");

    expect(keychain.setPassword).toHaveBeenCalledWith(
      KEYCHAIN_SERVICE,
      KEYCHAIN_ACCOUNT,
      "new-key",
    );
  });

  it("rejects empty keys", async () => {
    setKeychainProvider(fakeKeychain());
    await expect(saveApiKey("   ")).rejects.toThrow(/empty/i);
  });
});

describe("maskApiKey", () => {
  it("shows only the last 4 characters", () => {
    expect(maskApiKey("super-secret-1234")).toBe("***1234");
  });

  it("returns *** for very short keys", () => {
    expect(maskApiKey("ab")).toBe("***");
    expect(maskApiKey("abcd")).toBe("***");
  });
});
