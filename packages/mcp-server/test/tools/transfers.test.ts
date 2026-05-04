import { describe, expect, it, vi } from "vitest";

import { type BrightyClient } from "../../src/api/client.js";
import { transferIntent } from "../../src/tools/transfers/transfer-intent.js";
import {
  runTransferOwn,
  transferOwn,
  type OwnTransferResult,
} from "../../src/tools/transfers/transfer-own.js";
import { transfersTools } from "../../src/tools/transfers/index.js";
import type { OwnTransfer, TransferIntent } from "../../src/types/brighty.js";

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
  it("POSTs to /transfers/intent with the resolved body and default amountSide=SOURCE", async () => {
    const intent: TransferIntent = {
      hash: "h_abc",
      sourceAccountId: "acc1",
      destinationAccountId: "acc2",
      fromAmount: { amount: "100.00", currency: "EUR" },
      toAmount: { amount: "108.50", currency: "USD" },
      rate: "1.085",
    };
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(intent);

    const args = transferIntent.inputSchema.parse({
      sourceAccountId: "acc1",
      destinationAccountId: "acc2",
      amount: { amount: "100.00", currency: "EUR" },
    });

    const result = await transferIntent.execute(client, args);

    expect(result).toEqual(intent);
    expect(post).toHaveBeenCalledWith("/transfers/own/intent", {
      body: {
        sourceAccountId: "acc1",
        destinationAccountId: "acc2",
        amount: { amount: "100.00", currency: "EUR" },
        amountSide: "SOURCE",
      },
    });
  });

  it("forwards an explicit amountSide=DESTINATION", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce({
      hash: "h",
      sourceAccountId: "a",
      destinationAccountId: "b",
      fromAmount: { amount: "92.00", currency: "EUR" },
      toAmount: { amount: "100.00", currency: "USD" },
    });

    const args = transferIntent.inputSchema.parse({
      sourceAccountId: "a",
      destinationAccountId: "b",
      amount: { amount: "100.00", currency: "USD" },
      amountSide: "DESTINATION",
    });
    await transferIntent.execute(client, args);

    const [, opts] = post.mock.calls[0]!;
    expect(opts.body.amountSide).toBe("DESTINATION");
  });

  it("rejects a non-decimal amount string at parse time", () => {
    expect(() =>
      transferIntent.inputSchema.parse({
        sourceAccountId: "a",
        destinationAccountId: "b",
        amount: { amount: "abc", currency: "EUR" },
      }),
    ).toThrow();
  });

  it("rejects a missing destinationAccountId at parse time", () => {
    expect(() =>
      transferIntent.inputSchema.parse({
        sourceAccountId: "a",
        amount: { amount: "1.00", currency: "EUR" },
      }),
    ).toThrow();
  });
});

describe("brighty_transfer_own", () => {
  function fixtureIntent(hash = "h_42"): TransferIntent {
    return {
      hash,
      sourceAccountId: "acc1",
      destinationAccountId: "acc2",
      fromAmount: { amount: "100.00", currency: "EUR" },
      toAmount: { amount: "108.50", currency: "USD" },
      rate: "1.085",
    };
  }

  function fixtureTransfer(hash = "h_42"): OwnTransfer {
    return {
      id: "tr1",
      hash,
      sourceAccountId: "acc1",
      destinationAccountId: "acc2",
      fromAmount: { amount: "100.00", currency: "EUR" },
      toAmount: { amount: "108.50", currency: "USD" },
      status: "PENDING",
      createdAt: "2026-04-27T10:00:00Z",
    };
  }

  it("calls intent first, then /transfers/own forwarding the hash with a UUID idempotency key", async () => {
    const intent = fixtureIntent();
    const transfer = fixtureTransfer();
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(intent).mockResolvedValueOnce(transfer);

    const args = transferOwn.inputSchema.parse({
      sourceAccountId: "acc1",
      destinationAccountId: "acc2",
      amount: { amount: "100.00", currency: "EUR" },
    });

    const result = (await transferOwn.execute(client, args)) as OwnTransferResult;

    expect(post).toHaveBeenCalledTimes(2);

    const [firstPath, firstOpts] = post.mock.calls[0]!;
    expect(firstPath).toBe("/transfers/own/intent");
    expect(firstOpts.body).toEqual({
      sourceAccountId: "acc1",
      destinationAccountId: "acc2",
      amount: { amount: "100.00", currency: "EUR" },
      amountSide: "SOURCE",
    });
    expect(firstOpts.idempotencyKey).toBeUndefined();

    const [secondPath, secondOpts] = post.mock.calls[1]!;
    expect(secondPath).toBe("/transfers/own");
    expect(secondOpts.body).toEqual({ hash: "h_42" });
    expect(secondOpts.idempotencyKey).toMatch(UUID_V4_RE);

    expect(result.intent).toEqual(intent);
    expect(result.transfer).toEqual(transfer);
    expect(result.idempotencyKey).toBe(secondOpts.idempotencyKey);
  });

  it("generates a fresh idempotency key per invocation", async () => {
    const { client, post } = makeClient();
    post
      .mockResolvedValueOnce(fixtureIntent("hA"))
      .mockResolvedValueOnce(fixtureTransfer("hA"))
      .mockResolvedValueOnce(fixtureIntent("hB"))
      .mockResolvedValueOnce(fixtureTransfer("hB"));

    const args = transferOwn.inputSchema.parse({
      sourceAccountId: "acc1",
      destinationAccountId: "acc2",
      amount: { amount: "100.00", currency: "EUR" },
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
      destinationAccountId: "acc2",
      amount: { amount: "100.00", currency: "EUR" },
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
        destinationAccountId: "acc2",
        amount: { amount: "100.00", currency: "EUR" },
        idempotencyKey: "client-supplied-uuid",
      }),
    ).toThrow();
  });
});
