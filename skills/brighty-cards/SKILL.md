---
name: brighty-cards
description: |
  Issue and manage Brighty business cards (virtual and physical): order a
  card attached to a chosen account, freeze and unfreeze on suspected loss,
  and set or replace daily and monthly spend limits. Use when the user asks
  to issue a card, get a virtual card for a subscription, freeze a lost
  card, raise or lower a card's limit, list cards on the business, or pick
  a card design.
  Triggers: card, virtual card, physical card, issue card, order card,
  freeze card, unfreeze card, lock card, lost card, card limit, daily
  limit, monthly limit, spending limit, card design.
license: MIT
metadata:
  version: "0.0.1"
  author: brighty
---

# Brighty Cards

Tools to issue and manage Brighty cards. Cards attach to a `CURRENT` account
(see `brighty-banking`) and spend in that account's currency. Activate this
skill when the user wants to issue a card, change a card's limits, or
freeze/unfreeze a card.

## Tools provided

Lookup (2):

- `brighty_list_cards` — list cards on the business; supports `status`, `kind`, `accountId` filters.
- `brighty_get_card` — fetch one card by id, including its limits and last4.

Catalog (2):

- `brighty_list_card_designs` — list available card designs; supports `kind` filter.
- `brighty_get_virtual_card_product` — fetch the virtual card product for a currency: issuance fee, monthly fee, designs offered.

Lifecycle (4):

- `brighty_order_card` — order a new card. Two-step internally: POSTs `/cards/order/intent` (returns fees + short-lived `hash`), then POSTs `/cards/order` with `{ hash }` and a fresh UUIDv4 idempotency key. Returns `{ intent, card, idempotencyKey }`.
- `brighty_freeze_card` — block authorisations on a card. Reversible via `brighty_unfreeze_card`.
- `brighty_unfreeze_card` — resume authorisations on a previously frozen card.
- `brighty_set_card_limits` — replace `daily` and/or `monthly` spend limits on a card. At least one bucket required.

Reference material:

- `references/CARD_LIMITS.md` — daily vs monthly buckets, currency rules, how partial replacement works, validation pitfalls.

## Critical patterns

**Order is two-step — show fees from the intent before the final order.**
`brighty_order_card` internally fetches an intent first, then commits with
the returned `hash`. The intent carries the issuance fee, the monthly fee,
and any product-specific fees. Before letting the agent call the order
tool end-to-end, walk the user through the fees and the design so they can
accept or reject. For a `VIRTUAL` card you can also call
`brighty_get_virtual_card_product` up front to surface fees independently
of the order intent — useful when the user is shopping options.

**Freeze first, ask later (on suspected compromise).** When the user says a
card was lost, stolen, or suspect ("I think someone got my card number"),
call `brighty_freeze_card` immediately on the affected `cardId` before
asking follow-up questions. Freezing is reversible; an unauthorised charge
is not. After freezing, confirm with the user and decide whether to
unfreeze (false alarm) or escalate (the user will need the Brighty app to
terminate and re-issue — there is no terminate tool exposed via MCP).

**Limits are a full replace per call.** `brighty_set_card_limits` PUTs the
limits object. Whichever bucket you supply gets set to that value;
whichever bucket you omit is left at its current value (the tool only
sends keys you supply). To clear a bucket entirely, the API requires you
to surface that to the user — there is no "no limit" sentinel exposed
here. See `references/CARD_LIMITS.md`.

## Core workflows

### Issue a virtual card ("get me a virtual card on the EUR account")

1. Confirm the `accountId` and the card's currency context. If the user did
   not name an account, call `brighty_list_accounts` (banking skill) and
   filter to `type: "CURRENT"` accounts in the requested currency. Cards
   cannot attach to `SAVING` accounts — reject with a clear message and
   point at `brighty-banking` for opening a `CURRENT` account.
2. (Optional, recommended) Call `brighty_get_virtual_card_product` with the
   account's currency. Show the user the issuance fee and monthly fee so
   they can accept the cost up-front.
3. (Optional) Call `brighty_list_card_designs` with `kind: "VIRTUAL"` and
   show the user the available designs. Capture the chosen `designId`.
4. Call `brighty_order_card` with `kind: "VIRTUAL"`, `accountId`, and the
   chosen `designId` if any. Optionally set `cardholderName` and initial
   `limits`. The tool runs the intent → order sequence internally.
5. Surface the `intent.fees`, the new `card.id`, `card.last4` (if
   returned), and the `idempotencyKey` to the user. The card is usable
   immediately for online spend.

### Issue a physical card

Same shape as virtual, with `kind: "PHYSICAL"`. Two differences:

- There is no separate physical-card product lookup tool exposed (only
  `brighty_get_virtual_card_product` exists). For physical orders, the
  order intent itself carries the fees. Show `intent.fees` to the user
  before treating the order as committed.
- A physical card ships and may have `status: "ORDERED"` when first
  returned; it transitions to `ACTIVE` after issuance. Set expectations
  with the user about the delay.

### Freeze a card on suspected loss / compromise

1. If the user gave the card last4 or a description, call
   `brighty_list_cards` (filter by `accountId` if known) and pick the
   matching card. If multiple cards match the description, ask the user
   to disambiguate before freezing — but err toward freezing the
   most-likely candidate when the user signals urgency ("freeze my card
   now").
2. Call `brighty_freeze_card` with the `cardId`. Confirm the new status to
   the user.
3. Ask whether the user wants to unfreeze (false alarm) or terminate and
   re-issue. Termination is not exposed via MCP — direct the user to the
   Brighty app for that path.

### Set or change spending limits

1. If the user did not name a card, call `brighty_list_cards` and pick.
   Show last4 + currency to disambiguate.
2. Confirm the desired `daily` and/or `monthly` amounts and the currency
   (must match the card's currency — see `references/CARD_LIMITS.md`).
3. Call `brighty_set_card_limits` with `cardId` plus the buckets the user
   wants to change. To set both, supply both. To change only one, supply
   only that one — the other remains at its current value.
4. Echo the new limits from the tool's return value.

### List or look up cards

For "show me my cards", `brighty_list_cards` with no filters. For "show me
my active EUR cards", filter by `status: "ACTIVE"` and either pass
`accountId` (fetched from `brighty_list_accounts`) or filter the result
client-side after listing. Use `brighty_get_card` when you already have a
specific id and want full detail (limits, design, cardholderName).

## Important behaviours

- Money is `{ amount: string, currency: string }`. Treat `amount` as a
  decimal string — never `Number()` it. Forward verbatim when displaying
  fees and limits.
- Card currency follows the attached account's currency. The card cannot
  spend in a different currency without FX (handled by the rail at swipe
  time, not by these tools).
- `brighty_order_card` returns `{ intent, card, idempotencyKey }` so the
  agent can surface what was committed. The key is generated server-side
  per call and is not accepted as input — a fresh intent (with a fresh
  hash) is fetched on every invocation, so a "stable" replay key would
  carry a different body and break the idempotency contract. If a network
  call appears to have failed, ask the user to confirm in the Brighty app
  whether the card was issued before retrying.
- `brighty_set_card_limits` rejects if neither `daily` nor `monthly` is
  supplied. The error is raised before the network call.
- `brighty_freeze_card` is idempotent at the API layer (freezing an
  already-frozen card is a no-op); same for `brighty_unfreeze_card`.
- The acting API key represents a single business; there is no
  `businessId` parameter on any tool here.
- All ids are strings. Do not parse them.
- There is no MCP tool to terminate a card. Direct the user to the
  Brighty app when termination is required.

## When NOT to use this skill

- Listing balances or account details, opening/closing accounts, inviting
  teammates → use `brighty-banking`.
- Moving money between accounts or to external recipients → use
  `brighty-payouts`.
- Paying a single invoice from a PDF or image → use `brighty-invoice-pay`.

## Error handling

Brighty errors arrive as `{ name, message, description, status, code }`.
Surface `description` (or `message` if absent) verbatim to the user; do
not rephrase. On 401, instruct the user to set `BRIGHTY_API_KEY` or run
`brighty-mcp login`. On 409 from `brighty_order_card` (typically a stale
or replayed `hash`), retry the full `brighty_order_card` call so a fresh
intent is fetched — never reuse a `hash` across calls.
