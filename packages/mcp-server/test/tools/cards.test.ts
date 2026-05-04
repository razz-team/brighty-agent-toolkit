import { describe, expect, it, vi } from "vitest";

import { type BrightyClient } from "../../src/api/client.js";
import { cardsTools } from "../../src/tools/cards/index.js";
import { orderCard, runOrderCard, type OrderCardResult } from "../../src/tools/cards/order-card.js";
import { setCardLimits } from "../../src/tools/cards/set-card-limits.js";
import type { Card, CardOrderIntent, CardOrderResponse } from "../../src/types/brighty.js";

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
    getBaseUrl: () => "https://api.brighty.app/business/v1",
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
      expect(t.inputSchema.shape).toBeDefined();
    }
  });
});

describe("brighty_order_card — two-step intent → order", () => {
  function fixtureIntent(hash = "h_card"): CardOrderIntent {
    return {
      hash,
      amount: { amount: "5.00", currency: "EUR" },
      fees: { issuance: { amount: "5.00", currency: "EUR" } },
    };
  }

  function fixtureCard(): Card {
    return {
      id: "card_1",
      name: "Team card",
      type: "DEBIT",
      network: "VISA",
      formFactor: "VIRTUAL",
      status: "ACTIVE",
      cardOwnerId: "owner_1",
      cardHolderId: "holder_1",
      cardHolderName: "Jane Doe",
      cardDesign: { id: "design_1" },
      createdAt: "2026-04-27T10:00:00Z",
      lastFour: "1234",
    };
  }

  function fixtureOrderResponse(): CardOrderResponse {
    return { card: fixtureCard() };
  }

  it("calls /cards/order/intent first, then /cards/order forwarding hash + fees + sourceAccountId with a UUIDv4 idempotency key", async () => {
    const intent = fixtureIntent();
    const orderResponse = fixtureOrderResponse();
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(intent).mockResolvedValueOnce(orderResponse);

    const args = orderCard.inputSchema.parse({
      cardDesignId: "design_1",
      customerId: "customer_1",
      sourceAccountId: "acc_eur",
      holderName: "Jane Doe",
      cardName: "Team card",
      spendingLimit: { policy: "MONTHLY", limit: { amount: "2000.00", currency: "EUR" } },
    });

    const result = (await orderCard.execute(client, args)) as OrderCardResult;

    expect(post).toHaveBeenCalledTimes(2);

    const [firstPath, firstOpts] = post.mock.calls[0]!;
    expect(firstPath).toBe("/cards/order/intent");
    expect(firstOpts.body).toEqual({
      cardDesignId: "design_1",
      customerId: "customer_1",
      holderName: "Jane Doe",
    });
    expect(firstOpts.idempotencyKey).toBeUndefined();

    const [secondPath, secondOpts] = post.mock.calls[1]!;
    expect(secondPath).toBe("/cards/order");
    expect(secondOpts.body).toEqual({
      cardDesignId: "design_1",
      customerId: "customer_1",
      sourceAccountId: "acc_eur",
      hash: "h_card",
      fees: { issuance: { amount: "5.00", currency: "EUR" } },
      holderName: "Jane Doe",
      cardName: "Team card",
      spendingLimit: { name: "MONTHLY", limit: { amount: "2000.00", currency: "EUR" } },
    });
    expect(secondOpts.idempotencyKey).toMatch(UUID_V4_RE);

    expect(result.intent).toEqual(intent);
    expect(result.card).toEqual(orderResponse.card);
    expect(result.idempotencyKey).toBe(secondOpts.idempotencyKey);
  });

  it("omits optional fields from both bodies when not supplied", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(fixtureIntent()).mockResolvedValueOnce(fixtureOrderResponse());

    const args = orderCard.inputSchema.parse({
      cardDesignId: "design_1",
      customerId: "customer_1",
      sourceAccountId: "acc_eur",
    });
    await orderCard.execute(client, args);

    const [, firstOpts] = post.mock.calls[0]!;
    expect(firstOpts.body).toEqual({
      cardDesignId: "design_1",
      customerId: "customer_1",
    });
    expect("holderName" in firstOpts.body).toBe(false);

    const [, secondOpts] = post.mock.calls[1]!;
    expect(secondOpts.body).toEqual({
      cardDesignId: "design_1",
      customerId: "customer_1",
      sourceAccountId: "acc_eur",
      hash: "h_card",
      fees: { issuance: { amount: "5.00", currency: "EUR" } },
    });
    expect("holderName" in secondOpts.body).toBe(false);
    expect("cardName" in secondOpts.body).toBe(false);
    expect("spendingLimit" in secondOpts.body).toBe(false);
  });

  it("emits spendingLimit { name: 'UNLIMITED' } without `limit` when policy=UNLIMITED", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(fixtureIntent()).mockResolvedValueOnce(fixtureOrderResponse());

    const args = orderCard.inputSchema.parse({
      cardDesignId: "design_1",
      customerId: "customer_1",
      sourceAccountId: "acc_eur",
      spendingLimit: { policy: "UNLIMITED" },
    });
    await orderCard.execute(client, args);

    const [, secondOpts] = post.mock.calls[1]!;
    expect(secondOpts.body.spendingLimit).toEqual({ name: "UNLIMITED" });
  });

  it("generates a fresh idempotency key per invocation", async () => {
    const { client, post } = makeClient();
    post
      .mockResolvedValueOnce(fixtureIntent("hA"))
      .mockResolvedValueOnce(fixtureOrderResponse())
      .mockResolvedValueOnce(fixtureIntent("hB"))
      .mockResolvedValueOnce(fixtureOrderResponse());

    const args = orderCard.inputSchema.parse({
      cardDesignId: "design_1",
      customerId: "customer_1",
      sourceAccountId: "acc_eur",
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
      cardDesignId: "design_1",
      customerId: "customer_1",
      sourceAccountId: "acc_eur",
    });

    await expect(runOrderCard(client, args)).rejects.toThrow("intent failed");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toBe("/cards/order/intent");
  });

  it("rejects a missing cardDesignId at parse time", () => {
    expect(() => orderCard.inputSchema.parse({ customerId: "c", sourceAccountId: "a" })).toThrow();
  });

  it("rejects a missing sourceAccountId at parse time", () => {
    expect(() => orderCard.inputSchema.parse({ cardDesignId: "d", customerId: "c" })).toThrow();
  });

  it("rejects a client-supplied idempotencyKey at parse time (intent re-fetch makes replay unsafe)", () => {
    expect(orderCard.inputSchema.shape).not.toHaveProperty("idempotencyKey");
    expect(() =>
      orderCard.inputSchema.parse({
        cardDesignId: "d",
        customerId: "c",
        sourceAccountId: "a",
        idempotencyKey: "client-supplied-uuid",
      }),
    ).toThrow();
  });
});

describe("brighty_set_card_limits", () => {
  function fixtureCard(): Card {
    return {
      id: "card_1",
      name: "Card",
      type: "DEBIT",
      network: "VISA",
      formFactor: "VIRTUAL",
      status: "ACTIVE",
      cardOwnerId: "owner_1",
      cardHolderId: "holder_1",
      cardHolderName: "Jane Doe",
      cardDesign: { id: "design_1" },
      createdAt: "2026-04-27T10:00:00Z",
    };
  }

  it("PUTs { name: 'MONTHLY', limit } to /cards/:id/limits", async () => {
    const { client, put } = makeClient();
    put.mockResolvedValueOnce(fixtureCard());

    await setCardLimits.execute(client, {
      cardId: "card_1",
      policy: "MONTHLY",
      limit: { amount: "5000.00", currency: "EUR" },
    });

    expect(put).toHaveBeenCalledTimes(1);
    const [path, opts] = put.mock.calls[0]!;
    expect(path).toBe("/cards/card_1/limits");
    expect(opts.body).toEqual({
      name: "MONTHLY",
      limit: { amount: "5000.00", currency: "EUR" },
    });
  });

  it("PUTs { name: 'UNLIMITED' } without limit when policy=UNLIMITED", async () => {
    const { client, put } = makeClient();
    put.mockResolvedValueOnce(fixtureCard());

    await setCardLimits.execute(client, {
      cardId: "card_1",
      policy: "UNLIMITED",
    });

    const [, opts] = put.mock.calls[0]!;
    expect(opts.body).toEqual({ name: "UNLIMITED" });
    expect("limit" in opts.body).toBe(false);
  });

  it("encodes the cardId in the URL", async () => {
    const { client, put } = makeClient();
    put.mockResolvedValueOnce(fixtureCard());

    await setCardLimits.execute(client, {
      cardId: "card/with space",
      policy: "UNLIMITED",
    });

    const [path] = put.mock.calls[0]!;
    expect(path).toBe(`/cards/${encodeURIComponent("card/with space")}/limits`);
  });

  it("throws when policy=MONTHLY but limit is missing", async () => {
    const { client, put } = makeClient();

    await expect(
      setCardLimits.execute(client, { cardId: "card_1", policy: "MONTHLY" }),
    ).rejects.toThrow(/limit.*MONTHLY/);

    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a non-decimal limit amount at parse time", () => {
    expect(() =>
      setCardLimits.inputSchema.parse({
        cardId: "card_1",
        policy: "MONTHLY",
        limit: { amount: "abc", currency: "EUR" },
      }),
    ).toThrow();
  });
});
