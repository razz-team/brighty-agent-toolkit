---
name: brighty-payouts
description: |
  Move money from Brighty business accounts: batch payroll and supplier
  payments via the payout container, FX between own accounts at the live
  Brighty rate, and one-off internal or external transfers. Use when the
  user asks to pay multiple recipients at once, run payroll, send a SEPA
  or SWIFT transfer, push crypto on-chain, convert balances between
  currencies, or sweep funds between own accounts.
  Triggers: payroll, mass payment, batch payout, salaries, supplier
  payment, SEPA, SWIFT, ACH, on-chain transfer, FX, exchange, convert,
  move money between accounts.
license: MIT
metadata:
  version: "0.0.3"
  author: brighty
---

# Brighty Payouts

Tools to move money out of Brighty business accounts: batched payouts
(`CREATED` container with N transfers, committed in one shot), one-off
internal/external transfers attached to a payout, and FX between two of
the business's own accounts (intent + execute).

Activate this skill when the user wants to pay people or vendors, sweep
funds between currencies, or stage and run payroll.

## Tools provided

Payouts (6) — container + transfers + commit:

- `brighty_list_payouts` — list payouts. The API takes no input filter
  parameters. Returns `{ payouts: Payout[], nextPage? }`. Each `Payout`
  has `id`, `createdAt`, `state` (`CREATED` | `STARTED` | `COMPLETED`),
  `paidTransfers`, `totalTransfers`, optional `name`, `description`,
  `paidAmount`, `totalAmount`, `startedAt`, `completedAt`. **Capture
  `createdAt` from this list — every other payout call needs it.**
- `brighty_create_payout` — open a `CREATED` container. Optional `name`
  and `description`. Returns the new `Payout` (note `createdAt` — keep it
  for follow-up calls).
- `brighty_get_payout` — fetch one payout. Requires `payoutId` AND
  `createdAt` (the API rejects without `createdAt`). Returns
  `{ payout, transfers }` where each transfer is discriminated by `type`
  (`Crypto` | `Fiat` | `Internal`).
- `brighty_create_internal_transfer` — add a Brighty-to-Brighty transfer
  to a payout. Recipient is identified by `receiverUsername` (the @-tag on
  the recipient's Brighty profile, **not** a customer/account id). Source
  account currency must equal transfer currency; this tool does not FX.
  `Idempotency-Key` is required by the API; the tool auto-generates a
  UUIDv4 when none is supplied. Returns `{ transfer: { id, createdAt },
idempotencyKey }`.
- `brighty_create_external_transfer` — add a fiat (IBAN/BIC/account
  number) or crypto (on-chain address + `transferNetworkId`) transfer to
  a payout. Provide either an inline `beneficiary` (with `kind: "FIAT" |
"CRYPTO"`) or a saved `beneficiaryId`. **The API requires `createdAt`
  (the payout's timestamp) as a query param** — pass it via
  `payoutCreatedAt`. `Idempotency-Key` is required and auto-generated.
  Returns `{ transfer: { id, createdAt }, idempotencyKey }`.
- `brighty_start_payout` — commit a payout (POST
  `/payouts/{id}/start?createdAt=...`). Runs a local preflight balance
  check first: sum per-source-account requirements, fetch each source's
  balance, abort with a per-account shortfall list if any account is
  short. Requires `payoutId` and `createdAt`. The API returns 204 on
  success; the tool returns `{ ok: true }`. `skipPreflight=true` is
  dangerous and only used when the user has explicitly accepted
  partial-failure risk.

Transfers between own accounts (2) — FX-aware:

- `brighty_transfer_intent` — preview an FX between two of the business's
  own accounts. Inputs: `sourceAccountId`, `amount`, `side`
  (`SELL` = sell exactly this much of `sourceCurrency`; `BUY` = buy
  exactly this much of `targetCurrency`), `sourceCurrency`,
  `targetCurrency`. Returns `{ amount, quote: { sourceAmount,
targetAmount, fx? }, fees, deliveryInfo: { estimatedDeliveryDate },
hash }`. The `hash` is short-lived — pass it through to
  `brighty_transfer_own` immediately.
- `brighty_transfer_own` — execute the FX. Inputs are the same as
  `brighty_transfer_intent` plus `targetAccountId`. The tool re-fetches a
  fresh intent internally (so the rate is current), then POSTs
  `/transfers/own` with `{ sourceAccountId, targetAccountId, quote, hash,
fees }` and a generated UUIDv4 `Idempotency-Key`. Returns `{ intent,
transfer: { transactionId, transactionState, createdAt },
idempotencyKey }`.

Reference material:

- `references/CSV_FORMAT.md` — recipient list columns for batch payouts
  (payroll, supplier batches).
- `references/PAYOUT_STATES.md` — payout and transfer lifecycle states;
  what each one means and which actions are still possible.

## Critical patterns

**Capture `createdAt` on every payout you touch.** The Brighty API
requires `createdAt` as a query param on `GET /payouts/{id}`,
`POST /payouts/{id}/start`, and `POST /payouts/{id}/transfers/external`.
The value lives on the `Payout` object — pass it back exactly as the API
returned it (ISO Instant string).

**Always preview before committing FX.** Call `brighty_transfer_intent`
before `brighty_transfer_own` so the user sees the rate, fees, and
resolved `quote.sourceAmount` / `quote.targetAmount` and can accept or
reject. Never call `brighty_transfer_own` without first showing the user
what `brighty_transfer_intent` returned. (The execute tool re-fetches a
fresh intent internally for safety, but the user-facing preview step is
what gives them informed consent.)

**Always commit with `brighty_start_payout` last.** A payout in `CREATED`
state holds zero, one, or many transfers but moves no money.
`brighty_start_payout` is the only step that actually sends. Until it
runs, every `brighty_create_internal_transfer` /
`brighty_create_external_transfer` is just staging. Show the user the
full list of transfers (use `brighty_get_payout`) and have them confirm
before calling `brighty_start_payout`.

**Trust the preflight.** `brighty_start_payout` runs a local balance
check across all source accounts before committing; if any account is
short, the tool returns an MCP error result with body
`{ ok: false, error: "PreflightFailed", message, shortfalls: [...] }`
and the API call is never made. Surface the shortfall list verbatim — do
not retry without the user resolving it (top up the account or remove
transfers).

## Core workflows

### Batch payroll / supplier payments (CSV → external transfers → start)

1. Parse the recipient list. See `references/CSV_FORMAT.md` for columns
   (recipient name, IBAN, BIC, amount, currency, reference, beneficiary
   address, optional `isBusinessRecipient`).
2. Pick the source account. If the user didn't name one, call
   `brighty_list_accounts` (banking skill) and either ask or pick by
   currency match. Confirm currency matches the rows; reject
   mixed-currency batches against a single source — split into one payout
   per currency instead.
3. `brighty_create_payout` with a descriptive `name` (e.g. "April
   salaries"). **Capture `id` AND `createdAt` from the response.**
4. For each recipient, `brighty_create_external_transfer` with `payoutId`,
   `payoutCreatedAt` (from step 3), `sourceAccountId`, `amount`, and
   inline `beneficiary` with `kind: "FIAT"` (for IBAN/SWIFT/ACH) or
   `"CRYPTO"` (for on-chain). Set `isBusinessRecipient` when known so the
   rail picks the right AML category. Each call returns `{ transfer: {
id, createdAt }, idempotencyKey }`; keep idempotency keys for any
   retry logic.
5. `brighty_get_payout` once with `payoutId` + `createdAt`. Show the user
   the totals (`totalTransfers`, `totalAmount`) and at least the first
   few rows so they can sanity-check.
6. After explicit user confirmation, `brighty_start_payout` with
   `payoutId` + `createdAt`. If the preflight fails, surface the
   shortfall list and stop — do not retry with `skipPreflight=true`
   unless the user explicitly says so.

### FX between own accounts ("convert 10k EUR to USD on the savings account")

1. Confirm source and destination accounts and which side of the amount
   the user means (sell exactly 10k EUR → `side: "SELL"`,
   `sourceCurrency: "EUR"`, `targetCurrency: "USD"`, `amount: { amount:
"10000.00", currency: "EUR" }`; or receive exactly 10k USD →
   `side: "BUY"` with `amount.currency: "USD"`).
2. `brighty_transfer_intent` with the parameters above. Surface to the
   user: `quote.sourceAmount`, `quote.targetAmount`, `quote.fx` (if
   present), the `fees` array, and `deliveryInfo.estimatedDeliveryDate`.
3. After explicit user confirmation, `brighty_transfer_own` with the
   same parameters plus `targetAccountId`. Return both `intent` and
   `transfer` so the user sees what executed and at what rate.

Never call `brighty_transfer_own` directly from a "do FX between my
accounts" request without the preview step. The user must see the rate
first.

### Single supplier payment (one-off)

Same shape as batch, with one transfer. Do not skip the payout container —
it is how Brighty groups, idempotency-keys, and commits transfers.

1. `brighty_create_payout` (optional `name`, e.g. "Pay AWS invoice 4321").
   Capture `id` + `createdAt`.
2. `brighty_create_external_transfer` (FIAT or CRYPTO).
3. `brighty_get_payout`, confirm with user.
4. `brighty_start_payout`.

For a single internal transfer (within Brighty, no FX), substitute step 2
with `brighty_create_internal_transfer` (provide `receiverUsername`).

### Funding a SAVING account from a CURRENT account (same currency)

Same-currency moves between own accounts go through
`brighty_create_internal_transfer` inside a payout — but note the
`receiverUsername` requirement (the recipient's @-tag), so the recipient
must be addressable by username. If transferring between accounts owned
by the same business by id, use the FX flow even for same currency:
`brighty_transfer_intent` + `brighty_transfer_own` with matching
`sourceCurrency` and `targetCurrency`.

If currencies differ (e.g. CURRENT EUR → SAVING USD), always use the FX
flow.

## Important behaviours

- Money is `{ amount: string, currency: string }`. Treat `amount` as a
  decimal string — never `Number()` it. Forward verbatim when displaying.
- `Idempotency-Key` is **required** by the Brighty API on
  `POST /payouts/{id}/transfers/external`,
  `POST /payouts/{id}/transfers/internal`, and `POST /transfers/own`.
  The tools auto-generate UUIDv4 when not supplied. Keep the returned
  key on retries; reusing it makes the API safe to call again with the
  same body.
- `brighty_create_internal_transfer` requires `receiverUsername` (the
  recipient's @-tag), not a UUID account id. The runtime check rejects
  same-currency mismatches between source account and amount.
- `brighty_create_external_transfer` discriminates on `beneficiary.kind`.
  `FIAT` requires `beneficiaryName` plus at least IBAN or accountNumber;
  `CRYPTO` requires `accountNumber` (the on-chain address) and
  `transferNetworkId`. Memo is required on chains that need it (XRP,
  XLM). Alternatively, pass a saved `beneficiaryId` instead of an inline
  beneficiary.
- A payout can mix currencies across transfers but each source account in
  the payout must use a single currency. Mixing currencies on the same
  source rejects in the preflight.
- `skipPreflight: true` on `brighty_start_payout` bypasses the local
  balance check. Brighty will still reject the API call if the account
  is empty, but the user loses the per-account shortfall report. Only
  use when the user has explicitly accepted partial-failure risk.
- Payout `state` values are `CREATED` | `STARTED` | `COMPLETED`. There is
  no "DRAFT" / "RUNNING" / "FAILED" / "CANCELLED" — failures surface as
  per-transfer state inside the `transfers` array.
- All ids are strings (UUID format). Do not parse them.

## When NOT to use this skill

- Listing balances or account details, opening or closing accounts,
  inviting/removing teammates → use `brighty-banking`.
- Issuing or managing cards → use `brighty-cards`.
- Paying a single invoice from a PDF or image (extraction + confirmation
  pipeline) → use `brighty-invoice-pay` (it orchestrates the same payout
  tools but adds OCR/extraction guidance).

## Error handling

Brighty returns errors as `{ errorCode, name, description, params? }`.
Surface `description` verbatim — do not rephrase. On 401, instruct the
user to set `BRIGHTY_API_KEY` or run `brighty-mcp login`.

A blocked preflight from `brighty_start_payout` arrives as an MCP error
result whose body is
`{ ok: false, error: "PreflightFailed", message, shortfalls: [{ accountId, currency, required, available, shortfall }] }`.
Show the `shortfalls` list to the user and stop — top-up or
transfer-removal is on them.
