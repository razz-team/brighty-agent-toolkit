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
} {
  const get = vi.fn();
  const post = vi.fn();
  const stub = {
    get: overrides.get ?? get,
    post: overrides.post ?? post,
    put: overrides.put ?? vi.fn(),
    patch: overrides.patch ?? vi.fn(),
    delete: overrides.delete ?? vi.fn(),
    request: overrides.request ?? vi.fn(),
    getBaseUrl: () => "https://api.brighty.app/business/v1",
  };
  return {
    client: stub as unknown as BrightyClient,
    get: stub.get as ReturnType<typeof vi.fn>,
    post: stub.post as ReturnType<typeof vi.fn>,
  };
}

function fixtureAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "a1",
    type: "CURRENT",
    balance: { amount: "100.00", currency: "EUR" },
    holderId: "holder_1",
    ownerId: "owner_1",
    openedAt: "2026-01-01T00:00:00Z",
    ...overrides,
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
  it("forwards optional filter args as query parameters and unwraps the {accounts} envelope", async () => {
    const accounts = [fixtureAccount()];
    const { client, get } = makeClient();
    get.mockResolvedValueOnce({ accounts });

    const result = await listAccounts.execute(client, {
      type: "CURRENT",
      holderId: "holder_1",
    });

    expect(result).toEqual(accounts);
    expect(get).toHaveBeenCalledWith("/accounts", {
      query: { type: "CURRENT", holderId: "holder_1" },
    });
  });

  it("works with no filters (empty input)", async () => {
    const { client, get } = makeClient();
    get.mockResolvedValueOnce({ accounts: [] });

    const parsed = listAccounts.inputSchema.parse({});
    const result = await listAccounts.execute(client, parsed);

    expect(result).toEqual([]);
    const [path, opts] = get.mock.calls[0]!;
    expect(path).toBe("/accounts");
    expect(opts).toEqual({
      query: { type: undefined, holderId: undefined },
    });
  });

  it("propagates a BrightyApiError when the API returns 401", async () => {
    const { client, get } = makeClient();
    get.mockRejectedValueOnce(
      new BrightyApiError(
        401,
        { errorCode: 401, name: "Unauthorized", description: "Invalid token" },
        "Unauthorized",
      ),
    );

    await expect(
      listAccounts.execute(client, listAccounts.inputSchema.parse({})),
    ).rejects.toBeInstanceOf(BrightyApiError);
  });

  it("rejects an unknown type enum value at parse time", () => {
    expect(() => listAccounts.inputSchema.parse({ type: "weird" })).toThrow();
  });
});

describe("brighty_create_account", () => {
  it("POSTs to /accounts with type, currency, optional name and holderId", async () => {
    const created = fixtureAccount({
      id: "acc_new",
      type: "SAVING",
      balance: { amount: "0.00", currency: "USD" },
      name: "Rainy day",
    });
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(created);

    const result = await createAccount.execute(client, {
      type: "SAVING",
      currency: "USD",
      name: "Rainy day",
      holderId: "holder_2",
    });

    expect(result).toEqual(created);
    expect(post).toHaveBeenCalledWith("/accounts", {
      body: { type: "SAVING", currency: "USD", name: "Rainy day", holderId: "holder_2" },
    });
  });

  it("omits the optional fields when not provided", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(
      fixtureAccount({ id: "acc_new", balance: { amount: "0.00", currency: "EUR" } }),
    );

    await createAccount.execute(client, { type: "CURRENT", currency: "EUR" });

    const [, opts] = post.mock.calls[0]!;
    expect(opts.body).toEqual({ type: "CURRENT", currency: "EUR" });
    expect("name" in opts.body).toBe(false);
    expect("holderId" in opts.body).toBe(false);
  });

  it("rejects an invalid account type at parse time", () => {
    expect(() => createAccount.inputSchema.parse({ type: "CHECKING", currency: "EUR" })).toThrow();
  });

  it("rejects a missing currency at parse time", () => {
    expect(() => createAccount.inputSchema.parse({ type: "CURRENT" })).toThrow();
  });
});

describe("brighty_terminate_account", () => {
  it("POSTs /accounts/:id/terminate and returns a TERMINATED status payload", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(undefined);

    const result = await terminateAccount.execute(client, {
      accountId: "acc 1/with space",
    });

    expect(result).toEqual({
      accountId: "acc 1/with space",
      status: "TERMINATED",
    });
    expect(post).toHaveBeenCalledWith(
      `/accounts/${encodeURIComponent("acc 1/with space")}/terminate`,
    );
  });
});

describe("brighty_get_account_addresses", () => {
  it("GETs /accounts/:id/addresses and unwraps the {addresses} envelope", async () => {
    const addresses: AccountAddress[] = [
      {
        accountId: "acc1",
        currency: "EUR",
        type: "LOCAL_EU",
        designation: "UNIVERSAL",
        iban: "DE12500105170648489890",
        bic: "INGDDEFFXXX",
      },
    ];
    const { client, get } = makeClient();
    get.mockResolvedValueOnce({ addresses });

    const result = await getAccountAddresses.execute(client, {
      accountId: "acc1",
    });

    expect(result).toEqual(addresses);
    expect(get).toHaveBeenCalledWith("/accounts/acc1/addresses");
  });
});
