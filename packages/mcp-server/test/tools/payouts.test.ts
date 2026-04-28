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
import type { Account, Payout, PayoutTransfer } from "../../src/types/brighty.js";

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
    getBaseUrl: () => "https://api.brighty.app",
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
    currency: "EUR",
    balance: { amount: "10000.00", currency: "EUR" },
    availableBalance: { amount: "10000.00", currency: "EUR" },
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function fixtureTransfer(overrides: Partial<PayoutTransfer> = {}): PayoutTransfer {
  return {
    id: "tr1",
    payoutId: "p1",
    kind: "EXTERNAL",
    status: "PENDING",
    sourceAccountId: "acc_eur",
    amount: { amount: "100.00", currency: "EUR" },
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
      // Top-level inputSchema must be a plain z.object so registerAllTools
      // can introspect .shape — confirms no .refine() at the root.
      expect(t.inputSchema.shape).toBeDefined();
    }
  });
});

describe("brighty_create_internal_transfer", () => {
  it("validates source-account currency matches the amount currency before posting", async () => {
    const { client, get, post } = makeClient();
    get.mockResolvedValueOnce(fixtureAccount({ currency: "EUR" }));

    await expect(
      runCreateInternalTransfer(client, {
        payoutId: "p1",
        sourceAccountId: "acc_eur",
        amount: { amount: "50.00", currency: "USD" },
        recipientAccountId: "acc_other",
      }),
    ).rejects.toThrow(/currency mismatch/i);

    expect(get).toHaveBeenCalledWith("/accounts/acc_eur");
    expect(post).not.toHaveBeenCalled();
  });

  it("posts to /payouts/:id/transfers/internal with a generated UUIDv4 idempotency key when none supplied", async () => {
    const { client, get, post } = makeClient();
    get.mockResolvedValueOnce(fixtureAccount({ currency: "EUR" }));
    post.mockResolvedValueOnce(fixtureTransfer({ kind: "INTERNAL" }));

    const result = await runCreateInternalTransfer(client, {
      payoutId: "p 1",
      sourceAccountId: "acc_eur",
      amount: { amount: "100.00", currency: "EUR" },
      recipientAccountId: "acc_dst",
      reference: "April rent",
    });

    expect(post).toHaveBeenCalledTimes(1);
    const [path, opts] = post.mock.calls[0]!;
    expect(path).toBe(`/payouts/${encodeURIComponent("p 1")}/transfers/internal`);
    expect(opts.body).toEqual({
      sourceAccountId: "acc_eur",
      amount: { amount: "100.00", currency: "EUR" },
      recipientAccountId: "acc_dst",
      reference: "April rent",
    });
    expect(opts.idempotencyKey).toMatch(UUID_V4_RE);
    expect(result.idempotencyKey).toBe(opts.idempotencyKey);
  });

  it("uses recipientTag when supplied and forwards a client-supplied idempotency key", async () => {
    const { client, get, post } = makeClient();
    get.mockResolvedValueOnce(fixtureAccount());
    post.mockResolvedValueOnce(fixtureTransfer({ kind: "INTERNAL" }));

    await runCreateInternalTransfer(client, {
      payoutId: "p1",
      sourceAccountId: "acc_eur",
      amount: { amount: "10.00", currency: "EUR" },
      recipientTag: "@alice",
      idempotencyKey: "client-key-1",
    });

    const [, opts] = post.mock.calls[0]!;
    expect(opts.body.recipientTag).toBe("@alice");
    expect("recipientAccountId" in opts.body).toBe(false);
    expect(opts.idempotencyKey).toBe("client-key-1");
  });

  it("rejects when neither recipientAccountId nor recipientTag is provided", async () => {
    const { client, get, post } = makeClient();

    await expect(
      runCreateInternalTransfer(client, {
        payoutId: "p1",
        sourceAccountId: "acc_eur",
        amount: { amount: "10.00", currency: "EUR" },
      }),
    ).rejects.toThrow(/exactly one of recipientAccountId or recipientTag/);

    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects when both recipientAccountId and recipientTag are provided", async () => {
    const { client } = makeClient();
    await expect(
      runCreateInternalTransfer(client, {
        payoutId: "p1",
        sourceAccountId: "acc_eur",
        amount: { amount: "10.00", currency: "EUR" },
        recipientAccountId: "acc_dst",
        recipientTag: "@alice",
      }),
    ).rejects.toThrow(/exactly one of recipientAccountId or recipientTag/);
  });

  it("rejects a non-decimal amount string at parse time", () => {
    expect(() =>
      createInternalTransfer.inputSchema.parse({
        payoutId: "p1",
        sourceAccountId: "acc_eur",
        amount: { amount: "abc", currency: "EUR" },
        recipientAccountId: "acc_dst",
      }),
    ).toThrow();
  });
});

describe("brighty_create_external_transfer", () => {
  it("posts a fiat beneficiary verbatim with a generated idempotency key", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(fixtureTransfer({ kind: "EXTERNAL" }));

    const args = createExternalTransfer.inputSchema.parse({
      payoutId: "p1",
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
    post.mockResolvedValueOnce(fixtureTransfer({ kind: "EXTERNAL" }));

    const args = createExternalTransfer.inputSchema.parse({
      payoutId: "p1",
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

  it("rejects a beneficiary missing the discriminator kind at parse time", () => {
    expect(() =>
      createExternalTransfer.inputSchema.parse({
        payoutId: "p1",
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
    post.mockResolvedValueOnce(fixtureTransfer({ kind: "EXTERNAL" }));

    const args = createExternalTransfer.inputSchema.parse({
      payoutId: "p1",
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
  function payoutWithTransfers(transfers: PayoutTransfer[]): Payout {
    return {
      id: "p1",
      status: "DRAFT",
      transfers,
      transfersCount: transfers.length,
      createdAt: "2026-04-27T10:00:00Z",
    };
  }

  it("passes preflight when summed transfers fit within each source account's available balance, then POSTs /start", async () => {
    const transfers = [
      fixtureTransfer({
        id: "t1",
        sourceAccountId: "acc_eur",
        amount: { amount: "300.00", currency: "EUR" },
      }),
      fixtureTransfer({
        id: "t2",
        sourceAccountId: "acc_eur",
        amount: { amount: "200.50", currency: "EUR" },
      }),
      fixtureTransfer({
        id: "t3",
        sourceAccountId: "acc_usd",
        amount: { amount: "50.00", currency: "USD" },
      }),
    ];
    const payout = payoutWithTransfers(transfers);
    const startedPayout: Payout = { ...payout, status: "RUNNING" };

    const { client, get, post } = makeClient();
    get
      .mockResolvedValueOnce(payout)
      .mockResolvedValueOnce(
        fixtureAccount({
          id: "acc_eur",
          currency: "EUR",
          availableBalance: { amount: "1000.00", currency: "EUR" },
        }),
      )
      .mockResolvedValueOnce(
        fixtureAccount({
          id: "acc_usd",
          currency: "USD",
          availableBalance: { amount: "100.00", currency: "USD" },
        }),
      );
    post.mockResolvedValueOnce(startedPayout);

    const result = await startPayout.execute(client, { payoutId: "p1" });

    expect(result).toEqual(startedPayout);
    expect(get.mock.calls.map((c) => c[0])).toEqual([
      "/payouts/p1",
      "/accounts/acc_eur",
      "/accounts/acc_usd",
    ]);
    expect(post).toHaveBeenCalledWith("/payouts/p1/start");
  });

  it("returns a structured PreflightFailed block when any source account is short, and does NOT POST /start", async () => {
    const transfers = [
      fixtureTransfer({
        id: "t1",
        sourceAccountId: "acc_eur",
        amount: { amount: "1500.00", currency: "EUR" },
      }),
      fixtureTransfer({
        id: "t2",
        sourceAccountId: "acc_eur",
        amount: { amount: "750.50", currency: "EUR" },
      }),
    ];
    const payout = payoutWithTransfers(transfers);

    const { client, get, post } = makeClient();
    get.mockResolvedValueOnce(payout).mockResolvedValueOnce(
      fixtureAccount({
        id: "acc_eur",
        currency: "EUR",
        availableBalance: { amount: "1000.00", currency: "EUR" },
      }),
    );

    const result = (await startPayout.execute(client, {
      payoutId: "p1",
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

  it("formatResult on a successful Payout does not set isError", () => {
    const startedPayout: Payout = {
      id: "p1",
      status: "RUNNING",
      createdAt: "2026-04-27T10:00:00Z",
    };
    const callResult = startPayout.formatResult(startedPayout);
    expect(callResult.isError).toBeUndefined();
  });

  it("falls back to balance when availableBalance is absent", async () => {
    const transfers = [
      fixtureTransfer({
        sourceAccountId: "acc_eur",
        amount: { amount: "10.00", currency: "EUR" },
      }),
    ];
    const payout = payoutWithTransfers(transfers);
    const { client, get } = makeClient();
    get.mockResolvedValueOnce({
      id: "acc_eur",
      type: "CURRENT",
      currency: "EUR",
      balance: { amount: "5.00", currency: "EUR" },
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
    } satisfies Account);

    const result = await runPreflightBalanceCheck(client, payout);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.shortfalls[0]!.shortfall).toEqual({
        amount: "5",
        currency: "EUR",
      });
    }
  });

  it("skips the preflight when skipPreflight=true and POSTs /start directly", async () => {
    const payout = payoutWithTransfers([
      fixtureTransfer({
        sourceAccountId: "acc_eur",
        amount: { amount: "999999.00", currency: "EUR" },
      }),
    ]);
    const { client, get, post } = makeClient();
    get.mockResolvedValueOnce(payout);
    post.mockResolvedValueOnce({ ...payout, status: "RUNNING" });

    await startPayout.execute(client, {
      payoutId: "p1",
      skipPreflight: true,
    });

    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]![0]).toBe("/payouts/p1");
    expect(post).toHaveBeenCalledWith("/payouts/p1/start");
  });

  it("handles a payout with zero transfers — preflight passes trivially", async () => {
    const payout = payoutWithTransfers([]);
    const { client, get, post } = makeClient();
    get.mockResolvedValueOnce(payout);
    post.mockResolvedValueOnce({ ...payout, status: "RUNNING" });

    await startPayout.execute(client, { payoutId: "p1" });
    expect(get).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/payouts/p1/start");
  });

  it("throws when transfers under the same source account use mixed currencies", async () => {
    const payout = payoutWithTransfers([
      fixtureTransfer({
        sourceAccountId: "acc_eur",
        amount: { amount: "10.00", currency: "EUR" },
      }),
      fixtureTransfer({
        sourceAccountId: "acc_eur",
        amount: { amount: "10.00", currency: "USD" },
      }),
    ]);
    const { client } = makeClient();
    await expect(runPreflightBalanceCheck(client, payout)).rejects.toThrow(/mixed currencies/i);
  });

  it("encodes the payoutId in the URL on /start", async () => {
    const payout: Payout = {
      id: "p/1",
      status: "DRAFT",
      transfers: [],
      createdAt: "2026-04-27T10:00:00Z",
    };
    const { client, get, post } = makeClient();
    get.mockResolvedValueOnce(payout);
    post.mockResolvedValueOnce({ ...payout, status: "RUNNING" });

    await startPayout.execute(client, { payoutId: "p/1" });
    expect(post).toHaveBeenCalledWith(`/payouts/${encodeURIComponent("p/1")}/start`);
  });
});
