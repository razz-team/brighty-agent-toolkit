---
name: brighty-cards
description: |
  Issue and manage Brighty business cards (virtual / plastic / metal): order
  a card attached to a chosen account, freeze and unfreeze on suspected
  loss, and set or replace the card's spending policy. Use when the user
  asks to issue a card, get a virtual card for a subscription, freeze a
  lost card, raise or lower a card's limit, list cards on the business, or
  pick a card design.
  Triggers: card, virtual card, physical card, issue card, order card,
  freeze card, unfreeze card, lock card, lost card, card limit, monthly
  limit, spending limit, card design.
license: MIT
metadata:
  version: "0.0.2"
  author: brighty
---

# Brighty Cards

Tools to issue and manage Brighty cards. Cards spend from a `CURRENT`
account (see `brighty-banking`) in that account's currency. Activate this
skill when the user wants to issue a card, change a card's limits, or
freeze/unfreeze a card.

## Tools provided

Lookup (2):

- `brighty_list_cards` — list cards on the business. The API takes no
  filter params. Returns each card with `id`, `name`, `type`
  (`DEBIT` | `CREDIT` | `PREPAID`), `network` (`VISA` | `MASTERCARD`),
  `formFactor` (`VIRTUAL` | `PLASTIC` | `METAL`), `status` (`ISSUED` |
  `CREATED` | `ACTIVE` | `ACTIVATING` | `FROZEN` | `TERMINATED`),
  `cardOwnerId`, `cardHolderId`, `cardHolderName`, `cardDesign`,
  `createdAt`, optional `bin` / `lastFour` / `availableAmount` /
  `limitAmount` / `expirationDate`. Filter by `formFactor` / `status` /
  `cardHolderId` client-side after listing.
- `brighty_get_card` — fetch one card by id, including the full status
  and limits.

Catalog (2):

- `brighty_list_card_designs` — list available card designs. The API
  takes no filter params. Returns each design with `id`, optional
  `name`, `formFactor`, `imageUrl`, `available`.
- `brighty_get_virtual_card_product` — fetch the virtual card product
  configuration: per-condition fees (`issueFee`, `deliveryFee`),
  free/total card limits, supported `formFactor` and `cardType`. The API
  takes no input parameters.

Lifecycle (4):

- `brighty_order_card` — order a new card. Two-step internally:
  POSTs `/cards/order/intent` (returns `{ amount, fees, hash }`), then
  POSTs `/cards/order` with `{ cardDesignId, customerId,
sourceAccountId, fees, hash, holderName?, cardName?, spendingLimit? }`
  and a fresh UUIDv4 `Idempotency-Key`. Returns `{ intent, card,
idempotencyKey }`. Inputs: `cardDesignId`, `customerId`,
  `sourceAccountId`, optional `holderName`, `cardName`, `spendingLimit:
{ policy: "UNLIMITED" | "MONTHLY", limit?: Money }`.
- `brighty_freeze_card` — block authorisations on a card. Returns the
  full `Card`. Reversible via `brighty_unfreeze_card`.
- `brighty_unfreeze_card` — resume authorisations on a previously frozen
  card. Returns the full `Card`.
- `brighty_set_card_limits` — replace a card's spending policy. Sends
  PUT `/cards/{id}/limits` with `{ name: "UNLIMITED" | "MONTHLY",
limit?: Money }`. Use `policy: "UNLIMITED"` to remove the cap; use
  `policy: "MONTHLY"` plus a Money `limit` to set a per-month spend cap.

Reference material:

- `references/CARD_LIMITS.md` — `UNLIMITED` vs `MONTHLY` policies,
  currency rules, validation pitfalls.

## Critical patterns

**Order is two-step — show fees from the intent before the final order.**
`brighty_order_card` internally fetches an intent first, then commits
with the returned `hash`. The intent carries `amount` (the total to
debit) and `fees` (a `FeeType`-keyed map). Before letting the agent call
the order tool end-to-end, walk the user through `intent.amount` and
`intent.fees` so they can accept or reject. For form-factor and pricing
context, you can also call `brighty_get_virtual_card_product` up front
to surface the available conditions independently of the order intent.

**Freeze first, ask later (on suspected compromise).** When the user
says a card was lost, stolen, or suspect ("I think someone got my card
number"), call `brighty_freeze_card` immediately on the affected
`cardId` before asking follow-up questions. Freezing is reversible; an
unauthorised charge is not. After freezing, confirm with the user and
decide whether to unfreeze (false alarm) or escalate (the user will need
the Brighty app to terminate and re-issue — there is no terminate tool
exposed via MCP).

**Spending policy is a full replace per call.** `brighty_set_card_limits`
PUTs `{ name, limit? }`. The Brighty API treats the policy as a single
value, not separate daily/monthly buckets. To remove the cap entirely,
send `policy: "UNLIMITED"`. To set a monthly cap, send
`policy: "MONTHLY"` with a Money `limit`.

## Core workflows

### Issue a virtual card ("get me a virtual card on the EUR account")

1. Confirm the `sourceAccountId` and the card's currency context. If the
   user did not name an account, call `brighty_list_accounts` (banking
   skill) and filter to `type: "CURRENT"` accounts in the requested
   currency. Cards spend in their attached account's currency.
2. Confirm the `customerId` (typically the user's own `cardHolderId` or
   a teammate's id from `brighty_list_members`).
3. Pick the design: call `brighty_list_card_designs`, filter the result
   by `formFactor: "VIRTUAL"` client-side, and let the user choose. The
   chosen design's `id` becomes `cardDesignId`.
4. (Optional) Call `brighty_get_virtual_card_product` to surface the
   available conditions and fees independently of the order intent.
5. Call `brighty_order_card` with `cardDesignId`, `customerId`,
   `sourceAccountId`, optional `holderName`, `cardName`, and
   `spendingLimit`. The tool runs the intent → order sequence
   internally.
6. Surface `intent.amount`, `intent.fees`, the new `card.id`,
   `card.lastFour` (if returned), and the `idempotencyKey` to the user.

### Issue a plastic / metal card

Same shape as virtual, with a `cardDesignId` whose `formFactor` is
`PLASTIC` or `METAL`. The order intent carries the issuance fee and any
delivery fee — show `intent.fees` to the user before treating the order
as committed. A physical card may have `status: "CREATED"` or
`"ACTIVATING"` when first returned; it transitions to `ACTIVE` after
issuance and activation. Set expectations with the user about the delay.

### Freeze a card on suspected loss / compromise

1. If the user gave the card lastFour or a description, call
   `brighty_list_cards` and pick the matching card. If multiple cards
   match the description, ask the user to disambiguate before freezing —
   but err toward freezing the most-likely candidate when the user
   signals urgency ("freeze my card now").
2. Call `brighty_freeze_card` with the `cardId`. The API returns the
   full updated `Card`; surface `status: "FROZEN"`.
3. Ask whether the user wants to unfreeze (false alarm) or terminate and
   re-issue. Termination is not exposed via MCP — direct the user to the
   Brighty app for that path.

### Set or change spending policy

1. If the user did not name a card, call `brighty_list_cards` and pick.
   Show `lastFour` + `cardHolderName` to disambiguate.
2. Confirm the desired policy with the user:
   - For "no limit", send `policy: "UNLIMITED"` (no `limit` needed).
   - For "X EUR per month", send `policy: "MONTHLY"` with `limit:
{ amount: "X", currency: "EUR" }` (currency must match the card's
     currency context).
3. Call `brighty_set_card_limits` with `cardId` and the policy.
4. Echo the updated card returned by the API.

### List or look up cards

For "show me my cards", `brighty_list_cards` returns everything (no
server-side filters available). For "show me my active EUR cards",
filter the returned array client-side by `status` and `formFactor` /
amount currency. Use `brighty_get_card` when you already have a specific
id and want full detail.

## Important behaviours

- Money is `{ amount: string, currency: string }`. Treat `amount` as a
  decimal string — never `Number()` it. Forward verbatim when displaying
  fees and limits.
- Card currency follows the attached account's currency. The card
  cannot spend in a different currency without FX (handled by the rail
  at swipe time, not by these tools).
- `brighty_order_card` returns `{ intent, card, idempotencyKey }`. The
  key is generated server-side per call and is not accepted as input — a
  fresh intent (with a fresh hash) is fetched on every invocation, so a
  "stable" replay key would carry a different body and break the
  idempotency contract. If a network call appears to have failed, ask
  the user to confirm in the Brighty app whether the card was issued
  before retrying.
- `brighty_set_card_limits` rejects at runtime if `policy: "MONTHLY"` is
  passed without `limit`.
- `brighty_freeze_card` and `brighty_unfreeze_card` are idempotent at
  the API layer (freezing an already-frozen card is a no-op).
- The acting API key represents a single business; there is no
  `businessId` parameter on any tool here.
- All ids are strings (UUID format). Do not parse them.
- There is no MCP tool to terminate a card. Direct the user to the
  Brighty app when termination is required.

## When NOT to use this skill

- Listing balances or account details, opening/closing accounts,
  inviting teammates → use `brighty-banking`.
- Moving money between accounts or to external recipients → use
  `brighty-payouts`.
- Paying a single invoice from a PDF or image → use `brighty-invoice-pay`.

## Error handling

Brighty returns errors as `{ errorCode, name, description, params? }`.
Surface `description` verbatim to the user; do not rephrase. On 401,
instruct the user to set `BRIGHTY_API_KEY` or run `brighty-mcp login`.
On 409 from `brighty_order_card` (typically a stale or replayed `hash`),
retry the full `brighty_order_card` call so a fresh intent is fetched —
never reuse a `hash` across calls.
