import { describe, expect, it, vi } from "vitest";

import { type BrightyClient } from "../../src/api/client.js";
import { cardsTools } from "../../src/tools/cards/index.js";
import { orderCard, runOrderCard, type OrderCardResult } from "../../src/tools/cards/order-card.js";
import { setCardLimits } from "../../src/tools/cards/set-card-limits.js";
import type { Card, CardOrderIntent } from "../../src/types/brighty.js";

type ClientMethods = "get" | "post" | "put" | "patch" | "delete" | "request";

function makeClient(overrides: Partial<Record<ClientMethods, unknown>> = {}): {
  client: BrightyClient;
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn();
  const post = vi.fn();
  const put = vi.fn();
  const stub = {
    get: overrides.get ?? get,
    post: overrides.post ?? post,
    put: overrides.put ?? put,
    patch: overrides.patch ?? vi.fn(),
    delete: overrides.delete ?? vi.fn(),
    request: overrides.request ?? vi.fn(),
    getBaseUrl: () => "https://api.brighty.app",
  };
  return {
    client: stub as unknown as BrightyClient,
    get: stub.get as ReturnType<typeof vi.fn>,
    post: stub.post as ReturnType<typeof vi.fn>,
    put: stub.put as ReturnType<typeof vi.fn>,
  };
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("cards/index barrel", () => {
  it("exports eight cards tools with brighty_-prefixed snake_case names", () => {
    expect(cardsTools).toHaveLength(8);
    const names = cardsTools.map((t) => t.name).toSorted();
    expect(names).toEqual([
      "brighty_freeze_card",
      "brighty_get_card",
      "brighty_get_virtual_card_product",
      "brighty_list_card_designs",
      "brighty_list_cards",
      "brighty_order_card",
      "brighty_set_card_limits",
      "brighty_unfreeze_card",
    ]);
    for (const t of cardsTools) {
      expect(t.name).toMatch(/^brighty_[a-z_]+$/);
      expect(typeof t.handler).toBe("function");
      // Top-level inputSchema must be a plain z.object so registerAllTools
      // can introspect .shape — confirms no .refine() at the root.
      expect(t.inputSchema.shape).toBeDefined();
    }
  });
});

describe("brighty_order_card — two-step intent → order", () => {
  function fixtureIntent(hash = "h_card"): CardOrderIntent {
    return {
      hash,
      kind: "VIRTUAL",
      accountId: "acc_eur",
      currency: "EUR",
      designId: "design_1",
      fees: [{ description: "issuance", amount: { amount: "5.00", currency: "EUR" } }],
    };
  }

  function fixtureCard(): Card {
    return {
      id: "card_1",
      kind: "VIRTUAL",
      status: "ACTIVE",
      accountId: "acc_eur",
      currency: "EUR",
      last4: "1234",
      designId: "design_1",
      createdAt: "2026-04-27T10:00:00Z",
    };
  }

  it("calls /cards/order/intent first, then /cards/order forwarding the hash with a UUIDv4 idempotency key", async () => {
    const intent = fixtureIntent();
    const card = fixtureCard();
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(intent).mockResolvedValueOnce(card);

    const args = orderCard.inputSchema.parse({
      kind: "VIRTUAL",
      accountId: "acc_eur",
      designId: "design_1",
      cardholderName: "Jane Doe",
      limits: {
        daily: { amount: "100.00", currency: "EUR" },
        monthly: { amount: "2000.00", currency: "EUR" },
      },
    });

    const result = (await orderCard.execute(client, args)) as OrderCardResult;

    expect(post).toHaveBeenCalledTimes(2);

    const [firstPath, firstOpts] = post.mock.calls[0]!;
    expect(firstPath).toBe("/cards/order/intent");
    expect(firstOpts.body).toEqual({
      kind: "VIRTUAL",
      accountId: "acc_eur",
      designId: "design_1",
      cardholderName: "Jane Doe",
      limits: {
        daily: { amount: "100.00", currency: "EUR" },
        monthly: { amount: "2000.00", currency: "EUR" },
      },
    });
    expect(firstOpts.idempotencyKey).toBeUndefined();

    const [secondPath, secondOpts] = post.mock.calls[1]!;
    expect(secondPath).toBe("/cards/order");
    expect(secondOpts.body).toEqual({ hash: "h_card" });
    expect(secondOpts.idempotencyKey).toMatch(UUID_V4_RE);

    expect(result.intent).toEqual(intent);
    expect(result.card).toEqual(card);
    expect(result.idempotencyKey).toBe(secondOpts.idempotencyKey);
  });

  it("omits optional fields from the intent body when not supplied", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(fixtureIntent()).mockResolvedValueOnce(fixtureCard());

    const args = orderCard.inputSchema.parse({
      kind: "VIRTUAL",
      accountId: "acc_eur",
    });
    await orderCard.execute(client, args);

    const [, firstOpts] = post.mock.calls[0]!;
    expect(firstOpts.body).toEqual({
      kind: "VIRTUAL",
      accountId: "acc_eur",
    });
    expect("designId" in firstOpts.body).toBe(false);
    expect("cardholderName" in firstOpts.body).toBe(false);
    expect("limits" in firstOpts.body).toBe(false);
  });

  it("generates a fresh idempotency key per invocation", async () => {
    const { client, post } = makeClient();
    post
      .mockResolvedValueOnce(fixtureIntent("hA"))
      .mockResolvedValueOnce(fixtureCard())
      .mockResolvedValueOnce(fixtureIntent("hB"))
      .mockResolvedValueOnce(fixtureCard());

    const args = orderCard.inputSchema.parse({
      kind: "VIRTUAL",
      accountId: "acc_eur",
    });

    const r1 = await runOrderCard(client, args);
    const r2 = await runOrderCard(client, args);

    expect(r1.idempotencyKey).toMatch(UUID_V4_RE);
    expect(r2.idempotencyKey).toMatch(UUID_V4_RE);
    expect(r1.idempotencyKey).not.toBe(r2.idempotencyKey);
  });

  it("does not call /cards/order when the intent call fails", async () => {
    const { client, post } = makeClient();
    post.mockRejectedValueOnce(new Error("intent failed"));

    const args = orderCard.inputSchema.parse({
      kind: "VIRTUAL",
      accountId: "acc_eur",
    });

    await expect(runOrderCard(client, args)).rejects.toThrow("intent failed");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toBe("/cards/order/intent");
  });

  it("rejects an invalid kind at parse time", () => {
    expect(() => orderCard.inputSchema.parse({ kind: "DEBIT", accountId: "acc_eur" })).toThrow();
  });

  it("rejects a missing accountId at parse time", () => {
    expect(() => orderCard.inputSchema.parse({ kind: "VIRTUAL" })).toThrow();
  });

  it("rejects a client-supplied idempotencyKey at parse time (intent re-fetch makes replay unsafe)", () => {
    // Strict mode is what enforces this: a default-strip z.object would
    // silently drop the unknown key, and the caller would think their retry
    // was idempotent while the server quietly issued a new card on each call.
    expect(orderCard.inputSchema.shape).not.toHaveProperty("idempotencyKey");
    expect(() =>
      orderCard.inputSchema.parse({
        kind: "VIRTUAL",
        accountId: "acc_eur",
        idempotencyKey: "client-supplied-uuid",
      }),
    ).toThrow();
  });
});

describe("brighty_set_card_limits", () => {
  it("PUTs both daily and monthly Money objects to /cards/:id/limits", async () => {
    const updated: Card = {
      id: "card_1",
      kind: "VIRTUAL",
      status: "ACTIVE",
      accountId: "acc_eur",
      currency: "EUR",
      limits: {
        daily: { amount: "200.00", currency: "EUR" },
        monthly: { amount: "5000.00", currency: "EUR" },
      },
      createdAt: "2026-04-27T10:00:00Z",
    };
    const { client, put } = makeClient();
    put.mockResolvedValueOnce(updated);

    const result = await setCardLimits.execute(client, {
      cardId: "card_1",
      daily: { amount: "200.00", currency: "EUR" },
      monthly: { amount: "5000.00", currency: "EUR" },
    });

    expect(result).toEqual(updated);
    expect(put).toHaveBeenCalledTimes(1);
    const [path, opts] = put.mock.calls[0]!;
    expect(path).toBe("/cards/card_1/limits");
    expect(opts.body).toEqual({
      daily: { amount: "200.00", currency: "EUR" },
      monthly: { amount: "5000.00", currency: "EUR" },
    });
  });

  it("PUTs only the supplied bucket when one of daily/monthly is omitted", async () => {
    const { client, put } = makeClient();
    put.mockResolvedValueOnce({
      id: "card_1",
      kind: "VIRTUAL",
      status: "ACTIVE",
      accountId: "acc_eur",
      currency: "EUR",
      createdAt: "2026-04-27T10:00:00Z",
    } satisfies Card);

    await setCardLimits.execute(client, {
      cardId: "card_1",
      monthly: { amount: "1000.00", currency: "EUR" },
    });

    const [, opts] = put.mock.calls[0]!;
    expect(opts.body).toEqual({
      monthly: { amount: "1000.00", currency: "EUR" },
    });
    expect("daily" in opts.body).toBe(false);
  });

  it("encodes the cardId in the URL", async () => {
    const { client, put } = makeClient();
    put.mockResolvedValueOnce({
      id: "card/with space",
      kind: "VIRTUAL",
      status: "ACTIVE",
      accountId: "acc_eur",
      currency: "EUR",
      createdAt: "2026-04-27T10:00:00Z",
    } satisfies Card);

    await setCardLimits.execute(client, {
      cardId: "card/with space",
      daily: { amount: "10.00", currency: "EUR" },
    });

    const [path] = put.mock.calls[0]!;
    expect(path).toBe(`/cards/${encodeURIComponent("card/with space")}/limits`);
  });

  it("throws when neither daily nor monthly is supplied", async () => {
    const { client, put } = makeClient();

    await expect(setCardLimits.execute(client, { cardId: "card_1" })).rejects.toThrow(
      /at least one of daily or monthly/,
    );

    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a non-decimal limit amount at parse time", () => {
    expect(() =>
      setCardLimits.inputSchema.parse({
        cardId: "card_1",
        daily: { amount: "abc", currency: "EUR" },
      }),
    ).toThrow();
  });
});
