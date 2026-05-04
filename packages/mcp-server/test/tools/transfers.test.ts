import { describe, expect, it, vi } from "vitest";

import { type BrightyClient } from "../../src/api/client.js";
import { transferIntent } from "../../src/tools/transfers/transfer-intent.js";
import {
  runTransferOwn,
  transferOwn,
  type OwnTransferResult,
} from "../../src/tools/transfers/transfer-own.js";
import { transfersTools } from "../../src/tools/transfers/index.js";
import type { OwnTransferCreated, OwnTransferIntent } from "../../src/types/brighty.js";

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

function fixtureIntent(hash = "h_42"): OwnTransferIntent {
  return {
    hash,
    amount: { amount: "100.00", currency: "EUR" },
    quote: {
      sourceAmount: { amount: "100.00", currency: "EUR" },
      targetAmount: { amount: "108.50", currency: "USD" },
      fx: { rate: "1.085" },
    },
    fees: [{ description: "FX fee", amount: { amount: "0.50", currency: "EUR" } }],
    deliveryInfo: { estimatedDeliveryDate: "2026-04-27T11:00:00Z" },
  };
}

function fixtureCreated(): OwnTransferCreated {
  return {
    transactionId: "txn_1",
    transactionState: "PENDING",
    createdAt: "2026-04-27T10:00:00Z",
  };
}

describe("transfers/index barrel", () => {
  it("exports two transfer tools with brighty_-prefixed snake_case names", () => {
    expect(transfersTools).toHaveLength(2);
    const names = transfersTools.map((t) => t.name).toSorted();
    expect(names).toEqual(["brighty_transfer_intent", "brighty_transfer_own"]);
    for (const t of transfersTools) {
      expect(t.name).toMatch(/^brighty_[a-z_]+$/);
      expect(typeof t.handler).toBe("function");
    }
  });
});

describe("brighty_transfer_intent", () => {
  it("POSTs to /transfers/own/intent with the resolved body", async () => {
    const intent = fixtureIntent();
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(intent);

    const args = transferIntent.inputSchema.parse({
      sourceAccountId: "acc1",
      amount: { amount: "100.00", currency: "EUR" },
      side: "SELL",
      sourceCurrency: "EUR",
      targetCurrency: "USD",
    });

    const result = await transferIntent.execute(client, args);

    expect(result).toEqual(intent);
    expect(post).toHaveBeenCalledWith("/transfers/own/intent", {
      body: {
        amount: { amount: "100.00", currency: "EUR" },
        side: "SELL",
        sourceCurrency: "EUR",
        targetCurrency: "USD",
      },
    });
  });

  it("forwards an explicit side=BUY", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(fixtureIntent());

    const args = transferIntent.inputSchema.parse({
      sourceAccountId: "a",
      amount: { amount: "100.00", currency: "USD" },
      side: "BUY",
      sourceCurrency: "EUR",
      targetCurrency: "USD",
    });
    await transferIntent.execute(client, args);

    const [, opts] = post.mock.calls[0]!;
    expect(opts.body.side).toBe("BUY");
  });

  it("rejects a non-decimal amount string at parse time", () => {
    expect(() =>
      transferIntent.inputSchema.parse({
        sourceAccountId: "a",
        amount: { amount: "abc", currency: "EUR" },
        side: "SELL",
        sourceCurrency: "EUR",
        targetCurrency: "USD",
      }),
    ).toThrow();
  });

  it("rejects a missing side at parse time", () => {
    expect(() =>
      transferIntent.inputSchema.parse({
        sourceAccountId: "a",
        amount: { amount: "1.00", currency: "EUR" },
        sourceCurrency: "EUR",
        targetCurrency: "USD",
      }),
    ).toThrow();
  });
});

describe("brighty_transfer_own", () => {
  it("calls intent first, then /transfers/own forwarding hash + quote + fees + accounts with a UUID idempotency key", async () => {
    const intent = fixtureIntent();
    const created = fixtureCreated();
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(intent).mockResolvedValueOnce(created);

    const args = transferOwn.inputSchema.parse({
      sourceAccountId: "acc1",
      targetAccountId: "acc2",
      amount: { amount: "100.00", currency: "EUR" },
      side: "SELL",
      sourceCurrency: "EUR",
      targetCurrency: "USD",
    });

    const result = (await transferOwn.execute(client, args)) as OwnTransferResult;

    expect(post).toHaveBeenCalledTimes(2);

    const [firstPath, firstOpts] = post.mock.calls[0]!;
    expect(firstPath).toBe("/transfers/own/intent");
    expect(firstOpts.body).toEqual({
      amount: { amount: "100.00", currency: "EUR" },
      side: "SELL",
      sourceCurrency: "EUR",
      targetCurrency: "USD",
    });
    expect(firstOpts.idempotencyKey).toBeUndefined();

    const [secondPath, secondOpts] = post.mock.calls[1]!;
    expect(secondPath).toBe("/transfers/own");
    expect(secondOpts.body).toEqual({
      sourceAccountId: "acc1",
      targetAccountId: "acc2",
      quote: intent.quote,
      hash: intent.hash,
      fees: intent.fees,
    });
    expect(secondOpts.idempotencyKey).toMatch(UUID_V4_RE);

    expect(result.intent).toEqual(intent);
    expect(result.transfer).toEqual(created);
    expect(result.idempotencyKey).toBe(secondOpts.idempotencyKey);
  });

  it("generates a fresh idempotency key per invocation", async () => {
    const { client, post } = makeClient();
    post
      .mockResolvedValueOnce(fixtureIntent("hA"))
      .mockResolvedValueOnce(fixtureCreated())
      .mockResolvedValueOnce(fixtureIntent("hB"))
      .mockResolvedValueOnce(fixtureCreated());

    const args = transferOwn.inputSchema.parse({
      sourceAccountId: "acc1",
      targetAccountId: "acc2",
      amount: { amount: "100.00", currency: "EUR" },
      side: "SELL",
      sourceCurrency: "EUR",
      targetCurrency: "USD",
    });

    const r1 = await runTransferOwn(client, args);
    const r2 = await runTransferOwn(client, args);

    expect(r1.idempotencyKey).toMatch(UUID_V4_RE);
    expect(r2.idempotencyKey).toMatch(UUID_V4_RE);
    expect(r1.idempotencyKey).not.toBe(r2.idempotencyKey);
  });

  it("does not call /transfers/own when the intent call fails", async () => {
    const { client, post } = makeClient();
    post.mockRejectedValueOnce(new Error("intent failed"));

    const args = transferOwn.inputSchema.parse({
      sourceAccountId: "acc1",
      targetAccountId: "acc2",
      amount: { amount: "100.00", currency: "EUR" },
      side: "SELL",
      sourceCurrency: "EUR",
      targetCurrency: "USD",
    });

    await expect(runTransferOwn(client, args)).rejects.toThrow("intent failed");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toBe("/transfers/own/intent");
  });

  it("rejects a client-supplied idempotencyKey at parse time (intent re-fetch makes replay unsafe)", () => {
    // Strict mode is what enforces this: a default-strip z.object would
    // silently drop the unknown key, and the caller would think their retry
    // was idempotent while the server quietly committed a new transfer on
    // each call.
    expect(transferOwn.inputSchema.shape).not.toHaveProperty("idempotencyKey");
    expect(() =>
      transferOwn.inputSchema.parse({
        sourceAccountId: "acc1",
        targetAccountId: "acc2",
        amount: { amount: "100.00", currency: "EUR" },
        side: "SELL",
        sourceCurrency: "EUR",
        targetCurrency: "USD",
        idempotencyKey: "client-supplied-uuid",
      }),
    ).toThrow();
  });
});
