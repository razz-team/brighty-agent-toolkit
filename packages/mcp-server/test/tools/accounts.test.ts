import { describe, expect, it, vi } from "vitest";

import { BrightyApiError, type BrightyClient } from "../../src/api/client.js";
import { createAccount } from "../../src/tools/accounts/create-account.js";
import { getAccountAddresses } from "../../src/tools/accounts/get-account-addresses.js";
import { listAccounts } from "../../src/tools/accounts/list-accounts.js";
import { terminateAccount } from "../../src/tools/accounts/terminate-account.js";
import { accountsTools } from "../../src/tools/accounts/index.js";
import type { Account, AccountAddress } from "../../src/types/brighty.js";

type ClientMethods = "get" | "post" | "put" | "patch" | "delete" | "request";

function makeClient(overrides: Partial<Record<ClientMethods, unknown>> = {}): {
  client: BrightyClient;
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn();
  const post = vi.fn();
  const del = vi.fn();
  const stub = {
    get: overrides.get ?? get,
    post: overrides.post ?? post,
    put: overrides.put ?? vi.fn(),
    patch: overrides.patch ?? vi.fn(),
    delete: overrides.delete ?? del,
    request: overrides.request ?? vi.fn(),
    getBaseUrl: () => "https://api.brighty.app",
  };
  return {
    client: stub as unknown as BrightyClient,
    get: stub.get as ReturnType<typeof vi.fn>,
    post: stub.post as ReturnType<typeof vi.fn>,
    delete: stub.delete as ReturnType<typeof vi.fn>,
  };
}

describe("accounts/index barrel", () => {
  it("exports five accounts tools with brighty_-prefixed snake_case names", () => {
    expect(accountsTools).toHaveLength(5);
    const names = accountsTools.map((t) => t.name).toSorted();
    expect(names).toEqual([
      "brighty_create_account",
      "brighty_get_account",
      "brighty_get_account_addresses",
      "brighty_list_accounts",
      "brighty_terminate_account",
    ]);
    for (const t of accountsTools) {
      expect(t.name).toMatch(/^brighty_[a-z_]+$/);
      expect(typeof t.handler).toBe("function");
    }
  });
});

describe("brighty_list_accounts", () => {
  it("forwards optional filter args as query parameters", async () => {
    const accounts: Account[] = [
      {
        id: "a1",
        type: "CURRENT",
        currency: "EUR",
        balance: { amount: "100.00", currency: "EUR" },
        status: "ACTIVE",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ];
    const { client, get } = makeClient();
    get.mockResolvedValueOnce(accounts);

    const result = await listAccounts.execute(client, {
      status: "ACTIVE",
      type: "CURRENT",
      currency: "EUR",
    });

    expect(result).toEqual(accounts);
    expect(get).toHaveBeenCalledWith("/accounts", {
      query: { status: "ACTIVE", type: "CURRENT", currency: "EUR" },
    });
  });

  it("works with no filters (empty input)", async () => {
    const { client, get } = makeClient();
    get.mockResolvedValueOnce([]);

    const parsed = listAccounts.inputSchema.parse({});
    const result = await listAccounts.execute(client, parsed);

    expect(result).toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
    const [path, opts] = get.mock.calls[0]!;
    expect(path).toBe("/accounts");
    expect(opts).toEqual({
      query: { status: undefined, type: undefined, currency: undefined },
    });
  });

  it("propagates a BrightyApiError when the API returns 401", async () => {
    const { client, get } = makeClient();
    get.mockRejectedValueOnce(new BrightyApiError(401, { name: "Unauthorized" }, "Unauthorized"));

    await expect(
      listAccounts.execute(client, listAccounts.inputSchema.parse({})),
    ).rejects.toBeInstanceOf(BrightyApiError);
  });

  it("rejects an unknown status enum value at parse time", () => {
    expect(() => listAccounts.inputSchema.parse({ status: "weird" })).toThrow();
  });
});

describe("brighty_create_account", () => {
  it("POSTs to /accounts with the supplied type, currency, and name", async () => {
    const created: Account = {
      id: "acc_new",
      type: "SAVING",
      currency: "USD",
      name: "Rainy day",
      balance: { amount: "0.00", currency: "USD" },
      status: "ACTIVE",
      createdAt: "2026-04-27T10:00:00Z",
    };
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(created);

    const result = await createAccount.execute(client, {
      type: "SAVING",
      currency: "USD",
      name: "Rainy day",
    });

    expect(result).toEqual(created);
    expect(post).toHaveBeenCalledWith("/accounts", {
      body: { type: "SAVING", currency: "USD", name: "Rainy day" },
    });
  });

  it("omits the optional name field when not provided", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce({
      id: "acc_new",
      type: "CURRENT",
      currency: "EUR",
      balance: { amount: "0.00", currency: "EUR" },
      status: "ACTIVE",
      createdAt: "2026-04-27T10:00:00Z",
    });

    await createAccount.execute(client, { type: "CURRENT", currency: "EUR" });

    const [, opts] = post.mock.calls[0]!;
    expect(opts.body).toEqual({ type: "CURRENT", currency: "EUR" });
    expect("name" in opts.body).toBe(false);
  });

  it("rejects an invalid account type at parse time", () => {
    expect(() => createAccount.inputSchema.parse({ type: "CHECKING", currency: "EUR" })).toThrow();
  });

  it("rejects a missing currency at parse time", () => {
    expect(() => createAccount.inputSchema.parse({ type: "CURRENT" })).toThrow();
  });
});

describe("brighty_terminate_account", () => {
  it("DELETEs /accounts/:id and returns a TERMINATED status payload", async () => {
    const { client, delete: del } = makeClient();
    del.mockResolvedValueOnce(undefined);

    const result = await terminateAccount.execute(client, {
      accountId: "acc 1/with space",
    });

    expect(result).toEqual({
      accountId: "acc 1/with space",
      status: "TERMINATED",
    });
    expect(del).toHaveBeenCalledWith(`/accounts/${encodeURIComponent("acc 1/with space")}`);
  });
});

describe("brighty_get_account_addresses", () => {
  it("GETs /accounts/:id/addresses", async () => {
    const addresses: AccountAddress[] = [
      {
        accountId: "acc1",
        currency: "EUR",
        iban: "DE12500105170648489890",
        bic: "INGDDEFFXXX",
      },
    ];
    const { client, get } = makeClient();
    get.mockResolvedValueOnce(addresses);

    const result = await getAccountAddresses.execute(client, {
      accountId: "acc1",
    });

    expect(result).toEqual(addresses);
    expect(get).toHaveBeenCalledWith("/accounts/acc1/addresses");
  });
});
