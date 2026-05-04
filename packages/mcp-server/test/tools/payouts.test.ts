import { describe, expect, it, vi } from "vitest";

import { type BrightyClient } from "../../src/api/client.js";
import { createExternalTransfer } from "../../src/tools/payouts/create-external-transfer.js";
import {
  createInternalTransfer,
  runCreateInternalTransfer,
} from "../../src/tools/payouts/create-internal-transfer.js";
import {
  type StartPayoutBlocked,
  runPreflightBalanceCheck,
  startPayout,
} from "../../src/tools/payouts/start-payout.js";
import { payoutsTools } from "../../src/tools/payouts/index.js";
import type {
  Account,
  GetPayoutResponse,
  PayoutTransferDetailed,
  TransferPostponedResponse,
} from "../../src/types/brighty.js";

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

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fixtureAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc_eur",
    type: "CURRENT",
    balance: { amount: "10000.00", currency: "EUR" },
    holderId: "holder_1",
    ownerId: "owner_1",
    openedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function fixtureTransferDetailed(
  overrides: Partial<PayoutTransferDetailed> = {},
): PayoutTransferDetailed {
  return {
    type: "Fiat",
    id: "tr1",
    sourceAccountId: "acc_eur",
    amount: { amount: "100.00", currency: "EUR" },
    createdAt: "2026-04-27T10:00:00Z",
    ...overrides,
  };
}

function fixturePostponed(
  overrides: Partial<TransferPostponedResponse> = {},
): TransferPostponedResponse {
  return {
    id: "tr_postponed_1",
    createdAt: "2026-04-27T10:00:00Z",
    ...overrides,
  };
}

describe("payouts/index barrel", () => {
  it("exports six payout tools with brighty_-prefixed snake_case names", () => {
    expect(payoutsTools).toHaveLength(6);
    const names = payoutsTools.map((t) => t.name).toSorted();
    expect(names).toEqual([
      "brighty_create_external_transfer",
      "brighty_create_internal_transfer",
      "brighty_create_payout",
      "brighty_get_payout",
      "brighty_list_payouts",
      "brighty_start_payout",
    ]);
    for (const t of payoutsTools) {
      expect(t.name).toMatch(/^brighty_[a-z_]+$/);
      expect(typeof t.handler).toBe("function");
      expect(t.inputSchema.shape).toBeDefined();
    }
  });
});

describe("brighty_create_internal_transfer", () => {
  it("validates source-account currency matches the amount currency before posting", async () => {
    const { client, get, post } = makeClient();
    get.mockResolvedValueOnce(fixtureAccount({ balance: { amount: "1000.00", currency: "EUR" } }));

    await expect(
      runCreateInternalTransfer(client, {
        payoutId: "p1",
        sourceAccountId: "acc_eur",
        amount: { amount: "50.00", currency: "USD" },
        receiverUsername: "@alice",
      }),
    ).rejects.toThrow(/currency mismatch/i);

    expect(get).toHaveBeenCalledWith("/accounts/acc_eur");
    expect(post).not.toHaveBeenCalled();
  });

  it("posts to /payouts/:id/transfers/internal with receiverUsername and a generated UUIDv4 idempotency key", async () => {
    const { client, get, post } = makeClient();
    get.mockResolvedValueOnce(fixtureAccount());
    post.mockResolvedValueOnce(fixturePostponed());

    const result = await runCreateInternalTransfer(client, {
      payoutId: "p 1",
      sourceAccountId: "acc_eur",
      amount: { amount: "100.00", currency: "EUR" },
      receiverUsername: "@alice",
      comment: "April rent",
    });

    expect(post).toHaveBeenCalledTimes(1);
    const [path, opts] = post.mock.calls[0]!;
    expect(path).toBe(`/payouts/${encodeURIComponent("p 1")}/transfers/internal`);
    expect(opts.body).toEqual({
      sourceAccountId: "acc_eur",
      amount: { amount: "100.00", currency: "EUR" },
      receiverUsername: "@alice",
      comment: "April rent",
    });
    expect(opts.idempotencyKey).toMatch(UUID_V4_RE);
    expect(result.idempotencyKey).toBe(opts.idempotencyKey);
  });

  it("forwards a client-supplied idempotency key when provided", async () => {
    const { client, get, post } = makeClient();
    get.mockResolvedValueOnce(fixtureAccount());
    post.mockResolvedValueOnce(fixturePostponed());

    await runCreateInternalTransfer(client, {
      payoutId: "p1",
      sourceAccountId: "acc_eur",
      amount: { amount: "10.00", currency: "EUR" },
      receiverUsername: "@bob",
      idempotencyKey: "client-key-1",
    });

    const [, opts] = post.mock.calls[0]!;
    expect(opts.idempotencyKey).toBe("client-key-1");
  });

  it("rejects a non-decimal amount string at parse time", () => {
    expect(() =>
      createInternalTransfer.inputSchema.parse({
        payoutId: "p1",
        sourceAccountId: "acc_eur",
        amount: { amount: "abc", currency: "EUR" },
        receiverUsername: "@alice",
      }),
    ).toThrow();
  });

  it("rejects a missing receiverUsername at parse time", () => {
    expect(() =>
      createInternalTransfer.inputSchema.parse({
        payoutId: "p1",
        sourceAccountId: "acc_eur",
        amount: { amount: "10.00", currency: "EUR" },
      }),
    ).toThrow();
  });
});

describe("brighty_create_external_transfer", () => {
  it("posts a fiat beneficiary verbatim with createdAt query and a generated idempotency key", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(fixturePostponed());

    const args = createExternalTransfer.inputSchema.parse({
      payoutId: "p1",
      payoutCreatedAt: "2026-04-27T10:00:00Z",
      sourceAccountId: "acc_eur",
      amount: { amount: "1234.56", currency: "EUR" },
      beneficiary: {
        kind: "FIAT",
        beneficiaryName: "Acme GmbH",
        iban: "DE89370400440532013000",
        bic: "COBADEFFXXX",
        bankName: "Commerzbank",
        beneficiaryAddress: "Berlin, DE",
        isBusinessRecipient: true,
      },
      reference: "INV-2026-04-001",
    });

    const result = await createExternalTransfer.execute(client, args);

    expect(post).toHaveBeenCalledTimes(1);
    const [path, opts] = post.mock.calls[0]!;
    expect(path).toBe("/payouts/p1/transfers/external");
    expect(opts.query).toEqual({ createdAt: "2026-04-27T10:00:00Z" });
    expect(opts.body).toEqual({
      sourceAccountId: "acc_eur",
      amount: { amount: "1234.56", currency: "EUR" },
      beneficiary: {
        kind: "FIAT",
        beneficiaryName: "Acme GmbH",
        iban: "DE89370400440532013000",
        bic: "COBADEFFXXX",
        bankName: "Commerzbank",
        beneficiaryAddress: "Berlin, DE",
        isBusinessRecipient: true,
      },
      reference: "INV-2026-04-001",
    });
    expect(opts.idempotencyKey).toMatch(UUID_V4_RE);
    expect(result.idempotencyKey).toBe(opts.idempotencyKey);
  });

  it("posts a crypto beneficiary with transferNetworkId and on-chain accountNumber", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(fixturePostponed());

    const args = createExternalTransfer.inputSchema.parse({
      payoutId: "p1",
      payoutCreatedAt: "2026-04-27T10:00:00Z",
      sourceAccountId: "acc_btc",
      amount: { amount: "0.05", currency: "BTC" },
      beneficiary: {
        kind: "CRYPTO",
        beneficiaryName: "Cold Storage",
        accountNumber: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        transferNetworkId: "BTC",
      },
    });

    await createExternalTransfer.execute(client, args);

    const [, opts] = post.mock.calls[0]!;
    expect(opts.body.beneficiary).toEqual({
      kind: "CRYPTO",
      beneficiaryName: "Cold Storage",
      accountNumber: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      transferNetworkId: "BTC",
    });
    expect("reference" in opts.body).toBe(false);
    expect(opts.idempotencyKey).toMatch(UUID_V4_RE);
  });

  it("posts beneficiaryId without an inline beneficiary when the saved id is supplied", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(fixturePostponed());

    const args = createExternalTransfer.inputSchema.parse({
      payoutId: "p1",
      payoutCreatedAt: "2026-04-27T10:00:00Z",
      sourceAccountId: "acc_eur",
      amount: { amount: "100.00", currency: "EUR" },
      beneficiaryId: "ben_saved_1",
    });
    await createExternalTransfer.execute(client, args);

    const [, opts] = post.mock.calls[0]!;
    expect(opts.body.beneficiaryId).toBe("ben_saved_1");
    expect("beneficiary" in opts.body).toBe(false);
  });

  it("rejects when neither beneficiary nor beneficiaryId is supplied", async () => {
    const { client, post } = makeClient();
    const args = createExternalTransfer.inputSchema.parse({
      payoutId: "p1",
      payoutCreatedAt: "2026-04-27T10:00:00Z",
      sourceAccountId: "acc_eur",
      amount: { amount: "1.00", currency: "EUR" },
    });
    await expect(createExternalTransfer.execute(client, args)).rejects.toThrow(
      /beneficiary.*beneficiaryId/i,
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects a beneficiary missing the discriminator kind at parse time", () => {
    expect(() =>
      createExternalTransfer.inputSchema.parse({
        payoutId: "p1",
        payoutCreatedAt: "2026-04-27T10:00:00Z",
        sourceAccountId: "acc_eur",
        amount: { amount: "1.00", currency: "EUR" },
        beneficiary: {
          beneficiaryName: "X",
          iban: "DE89370400440532013000",
        },
      }),
    ).toThrow();
  });

  it("rejects a CRYPTO beneficiary missing transferNetworkId at parse time", () => {
    expect(() =>
      createExternalTransfer.inputSchema.parse({
        payoutId: "p1",
        payoutCreatedAt: "2026-04-27T10:00:00Z",
        sourceAccountId: "acc_btc",
        amount: { amount: "0.01", currency: "BTC" },
        beneficiary: {
          kind: "CRYPTO",
          accountNumber: "bc1qxyz",
        },
      }),
    ).toThrow();
  });

  it("rejects a FIAT beneficiary with no iban and no accountNumber before hitting the API", async () => {
    const { client, post } = makeClient();

    const args = createExternalTransfer.inputSchema.parse({
      payoutId: "p1",
      payoutCreatedAt: "2026-04-27T10:00:00Z",
      sourceAccountId: "acc_eur",
      amount: { amount: "100.00", currency: "EUR" },
      beneficiary: {
        kind: "FIAT",
        beneficiaryName: "Acme GmbH",
      },
    });

    await expect(createExternalTransfer.execute(client, args)).rejects.toThrow(
      /iban.*accountNumber|accountNumber.*iban/i,
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("accepts a FIAT beneficiary with only accountNumber (e.g. ACH) and posts to the API", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(fixturePostponed());

    const args = createExternalTransfer.inputSchema.parse({
      payoutId: "p1",
      payoutCreatedAt: "2026-04-27T10:00:00Z",
      sourceAccountId: "acc_usd",
      amount: { amount: "1000.00", currency: "USD" },
      beneficiary: {
        kind: "FIAT",
        beneficiaryName: "US Vendor LLC",
        accountNumber: "0123456789",
        routingNumber: "021000021",
      },
    });

    await createExternalTransfer.execute(client, args);
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe("brighty_start_payout — preflight balance check", () => {
  function payoutResponse(transfers: PayoutTransferDetailed[]): GetPayoutResponse {
    return {
      payout: {
        id: "p1",
        createdAt: "2026-04-27T10:00:00Z",
        state: "CREATED",
        paidTransfers: 0,
        totalTransfers: transfers.length,
      },
      transfers,
    };
  }

  it("passes preflight when summed transfers fit within each source account's balance, then POSTs /start", async () => {
    const transfers = [
      fixtureTransferDetailed({
        id: "t1",
        sourceAccountId: "acc_eur",
        amount: { amount: "300.00", currency: "EUR" },
      }),
      fixtureTransferDetailed({
        id: "t2",
        sourceAccountId: "acc_eur",
        amount: { amount: "200.50", currency: "EUR" },
      }),
      fixtureTransferDetailed({
        id: "t3",
        sourceAccountId: "acc_usd",
        amount: { amount: "50.00", currency: "USD" },
      }),
    ];

    const { client, get, post } = makeClient();
    get
      .mockResolvedValueOnce(payoutResponse(transfers))
      .mockResolvedValueOnce(
        fixtureAccount({ id: "acc_eur", balance: { amount: "1000.00", currency: "EUR" } }),
      )
      .mockResolvedValueOnce(
        fixtureAccount({ id: "acc_usd", balance: { amount: "100.00", currency: "USD" } }),
      );
    post.mockResolvedValueOnce(undefined);

    const result = await startPayout.execute(client, {
      payoutId: "p1",
      createdAt: "2026-04-27T10:00:00Z",
    });

    expect(result).toEqual({ ok: true });
    expect(get.mock.calls.map((c) => c[0])).toEqual([
      "/payouts/p1",
      "/accounts/acc_eur",
      "/accounts/acc_usd",
    ]);
    // get-payout call passes createdAt query
    expect(get.mock.calls[0]![1]?.query).toEqual({ createdAt: "2026-04-27T10:00:00Z" });
    expect(post).toHaveBeenCalledWith("/payouts/p1/start", {
      query: { createdAt: "2026-04-27T10:00:00Z" },
    });
  });

  it("returns a structured PreflightFailed block when any source account is short, and does NOT POST /start", async () => {
    const transfers = [
      fixtureTransferDetailed({
        id: "t1",
        sourceAccountId: "acc_eur",
        amount: { amount: "1500.00", currency: "EUR" },
      }),
      fixtureTransferDetailed({
        id: "t2",
        sourceAccountId: "acc_eur",
        amount: { amount: "750.50", currency: "EUR" },
      }),
    ];

    const { client, get, post } = makeClient();
    get
      .mockResolvedValueOnce(payoutResponse(transfers))
      .mockResolvedValueOnce(
        fixtureAccount({ id: "acc_eur", balance: { amount: "1000.00", currency: "EUR" } }),
      );

    const result = (await startPayout.execute(client, {
      payoutId: "p1",
      createdAt: "2026-04-27T10:00:00Z",
    })) as StartPayoutBlocked;

    expect(result.ok).toBe(false);
    expect(result.error).toBe("PreflightFailed");
    expect(result.message).toMatch(/Insufficient balance/);
    expect(result.shortfalls).toHaveLength(1);
    expect(result.shortfalls[0]).toMatchObject({
      accountId: "acc_eur",
      currency: "EUR",
      required: { amount: "2250.5", currency: "EUR" },
      available: { amount: "1000.00", currency: "EUR" },
      shortfall: { amount: "1250.5", currency: "EUR" },
    });
    expect(post).not.toHaveBeenCalled();
  });

  it("renders a blocked preflight as an MCP error result so the agent receives the structured shortfalls", () => {
    const blocked: StartPayoutBlocked = {
      ok: false,
      error: "PreflightFailed",
      message: "Insufficient balance to start payout (1 account(s) short).",
      shortfalls: [
        {
          accountId: "acc_eur",
          currency: "EUR",
          required: { amount: "5000", currency: "EUR" },
          available: { amount: "100.00", currency: "EUR" },
          shortfall: { amount: "4900", currency: "EUR" },
        },
      ],
    };
    const callResult = startPayout.formatResult(blocked);

    expect(callResult.isError).toBe(true);
    expect(callResult.content).toHaveLength(1);
    const first = callResult.content?.[0];
    expect(first?.type).toBe("text");
    const payload = JSON.parse((first as { text: string }).text);
    expect(payload).toMatchObject({
      ok: false,
      error: "PreflightFailed",
      shortfalls: [
        {
          accountId: "acc_eur",
          currency: "EUR",
          shortfall: { amount: "4900", currency: "EUR" },
        },
      ],
    });
  });

  it("formatResult on a successful { ok: true } does not set isError", () => {
    const callResult = startPayout.formatResult({ ok: true });
    expect(callResult.isError).toBeUndefined();
  });

  it("skips the preflight when skipPreflight=true and POSTs /start directly", async () => {
    const { client, get, post } = makeClient();
    post.mockResolvedValueOnce(undefined);

    await startPayout.execute(client, {
      payoutId: "p1",
      createdAt: "2026-04-27T10:00:00Z",
      skipPreflight: true,
    });

    expect(get).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith("/payouts/p1/start", {
      query: { createdAt: "2026-04-27T10:00:00Z" },
    });
  });

  it("handles a payout with zero transfers — preflight passes trivially", async () => {
    const { client, get, post } = makeClient();
    get.mockResolvedValueOnce(payoutResponse([]));
    post.mockResolvedValueOnce(undefined);

    await startPayout.execute(client, { payoutId: "p1", createdAt: "2026-04-27T10:00:00Z" });
    expect(get).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/payouts/p1/start", {
      query: { createdAt: "2026-04-27T10:00:00Z" },
    });
  });

  it("throws when transfers under the same source account use mixed currencies", async () => {
    const response = payoutResponse([
      fixtureTransferDetailed({
        sourceAccountId: "acc_eur",
        amount: { amount: "10.00", currency: "EUR" },
      }),
      fixtureTransferDetailed({
        sourceAccountId: "acc_eur",
        amount: { amount: "10.00", currency: "USD" },
      }),
    ]);
    const { client } = makeClient();
    await expect(runPreflightBalanceCheck(client, response)).rejects.toThrow(/mixed currencies/i);
  });

  it("encodes the payoutId in the URL on /start", async () => {
    const { client, get, post } = makeClient();
    get.mockResolvedValueOnce(payoutResponse([]));
    post.mockResolvedValueOnce(undefined);

    await startPayout.execute(client, { payoutId: "p/1", createdAt: "2026-04-27T10:00:00Z" });
    expect(post).toHaveBeenCalledWith(`/payouts/${encodeURIComponent("p/1")}/start`, {
      query: { createdAt: "2026-04-27T10:00:00Z" },
    });
  });
});
