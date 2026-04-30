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
  version: "0.0.1"
  author: brighty
---

# Brighty Payouts

Tools to move money out of Brighty business accounts: batched payouts (DRAFT
container with N transfers, committed in one shot), one-off internal/external
transfers attached to a payout, and FX between two of the business's own
accounts (intent + own).

Activate this skill when the user wants to pay people or vendors, sweep
funds between currencies, or stage and run payroll.

## Tools provided

Payouts (6) — DRAFT container + transfers + commit:

- `brighty_list_payouts` — list payouts; supports `status`, `limit`, `cursor`. Returns `{ items, cursor: { next, prev }, hasMore }`. To page forward, pass `cursor.next` back in as `cursor`; stop when `hasMore` is false or `cursor.next` is absent.
- `brighty_create_payout` — create an empty DRAFT payout. Optional `name`.
- `brighty_get_payout` — fetch one payout, including its transfers and totals by currency.
- `brighty_create_internal_transfer` — add a Brighty-to-Brighty transfer (recipient by `recipientAccountId` OR `recipientTag`, never both) to a DRAFT payout. Source account currency must equal transfer currency; this tool does not FX.
- `brighty_create_external_transfer` — add a fiat (IBAN/BIC/account number) or crypto (on-chain address + `transferNetworkId`) transfer to a DRAFT payout. The `beneficiary.kind` discriminator is `FIAT` or `CRYPTO`.
- `brighty_start_payout` — commit a DRAFT payout. Runs a local preflight balance check first (sums per-source-account requirements, fetches each source's `availableBalance`, aborts with a per-account shortfall list if any account is short). `skipPreflight=true` is dangerous and only used when the user has explicitly accepted partial-failure risk.

Transfers between own accounts (2) — FX-aware:

- `brighty_transfer_intent` — preview a transfer between two of the business's own accounts. Returns the live rate, fees, resolved `fromAmount`/`toAmount`, and a short-lived `hash`. `amountSide` chooses whether the supplied amount is the send-side (`SOURCE`, default) or receive-side (`DESTINATION`).
- `brighty_transfer_own` — execute the transfer. Internally re-fetches a fresh intent (so the rate is current) and POSTs `{ hash }` with a generated UUIDv4 idempotency key. Returns `{ intent, transfer, idempotencyKey }`.

Reference material:

- `references/CSV_FORMAT.md` — recipient list columns for batch payouts (payroll, supplier batches).
- `references/PAYOUT_STATES.md` — payout and transfer lifecycle states; what each one means and which actions are still possible.

## Critical patterns

**Always preview before committing FX.** Call `brighty_transfer_intent` before
`brighty_transfer_own` so the user sees the rate, fees, and resolved amounts
and can accept or reject. Never call `brighty_transfer_own` without first
showing the user what `brighty_transfer_intent` returned. (The execute tool
re-fetches a fresh intent internally for safety, but the user-facing preview
step is what gives them informed consent.)

**Always commit with `brighty_start_payout` last.** A payout in DRAFT state
holds zero, one, or many transfers but moves no money. `brighty_start_payout`
is the only step that actually sends. Until it runs, every
`brighty_create_internal_transfer` / `brighty_create_external_transfer` is
just staging. Show the user the full list of transfers (use
`brighty_get_payout`) and have them confirm before calling
`brighty_start_payout`.

**Trust the preflight.** `brighty_start_payout` runs a local balance check
across all source accounts before committing; if any account is short, the
tool returns an MCP error result with body
`{ ok: false, error: "PreflightFailed", message, shortfalls: [...] }` and
the API call is never made. Surface the shortfall list verbatim — do not
retry without the user resolving it (top up the account or remove transfers).

## Core workflows

### Batch payroll / supplier payments (CSV → external transfers → start)

1. Parse the recipient list. See `references/CSV_FORMAT.md` for columns
   (recipient name, IBAN, BIC, amount, currency, reference, beneficiary
   address, optional `isBusinessRecipient`). For free-form text, extract the
   same fields and confirm with the user before proceeding.
2. Pick the source account. If the user didn't name one, call
   `brighty_list_accounts` (banking skill) and either ask or pick by
   currency match. Confirm currency matches the rows; reject mixed-currency
   batches against a single source — split into one payout per currency
   instead.
3. `brighty_create_payout` with a descriptive `name` (e.g. "April salaries").
   Capture the returned `id` as `payoutId`.
4. For each recipient, `brighty_create_external_transfer` with
   `beneficiary.kind: "FIAT"` (for IBAN/SWIFT/ACH) or `"CRYPTO"` (for
   on-chain). Set `isBusinessRecipient` when known so the rail picks the
   right AML category. Each call returns `{ transfer, idempotencyKey }`;
   keep idempotency keys for any retry logic.
5. `brighty_get_payout` once. Show the user the totals by currency, the
   transfer count, and at least the first few rows so they can sanity-check.
6. After explicit user confirmation, `brighty_start_payout`. If the
   preflight fails, surface the shortfall list and stop — do not retry with
   `skipPreflight=true` unless the user explicitly says so.

### FX between own accounts ("convert 10k EUR to USD on the savings account")

1. Confirm the source and destination accounts and which side of the amount
   the user means (send N from EUR → use `amountSide: "SOURCE"`; receive
   exactly N USD → use `"DESTINATION"`).
2. `brighty_transfer_intent` with `sourceAccountId`, `destinationAccountId`,
   `amount`, `amountSide`. Surface to the user: the rate, the fees, and the
   resolved `fromAmount`/`toAmount`. The intent's `hash` is short-lived
   (`expiresAt`) — do not store it.
3. After explicit user confirmation, `brighty_transfer_own` with the same
   args (it re-fetches a fresh intent internally). Return both `intent` and
   `transfer` so the user sees what executed and at what rate.

Never call `brighty_transfer_own` directly from a "do FX between my accounts"
request without the preview step. The user must see the rate first.

### Single supplier payment (one-off)

Same shape as batch, with one transfer. Do not skip the payout container —
it is how Brighty groups, idempotency-keys, and commits transfers.

1. `brighty_create_payout` (optional `name`, e.g. "Pay AWS invoice 4321").
2. `brighty_create_external_transfer` (FIAT or CRYPTO).
3. `brighty_get_payout`, confirm with user.
4. `brighty_start_payout`.

For a single internal transfer (within Brighty, no FX), substitute step 2
with `brighty_create_internal_transfer`.

### Funding a SAVING account from a CURRENT account (same currency)

If the source and destination currencies match, this is a one-transfer
internal payout — use `brighty_create_internal_transfer` inside a payout, not
`brighty_transfer_own`. `brighty_transfer_own` is for FX (and works with
same-currency too, but is the heavier path).

If currencies differ (e.g. CURRENT EUR → SAVING USD), use the FX flow:
`brighty_transfer_intent` → `brighty_transfer_own`.

## Important behaviours

- Money is `{ amount: string, currency: string }`. Treat `amount` as a
  decimal string — never `Number()` it. Forward verbatim when displaying.
- Idempotency keys are auto-generated as UUIDv4 when not supplied. Keep the
  returned key on retries; reusing it makes the API safe to call again.
- `brighty_create_internal_transfer` requires exactly one of
  `recipientAccountId` or `recipientTag`. The runtime check rejects neither
  and both.
- `brighty_create_internal_transfer` does NOT perform FX. If the source
  account currency does not match the transfer currency, the tool throws —
  use `brighty_transfer_intent` + `brighty_transfer_own` instead.
- `brighty_create_external_transfer` discriminates on `beneficiary.kind`.
  `FIAT` requires `beneficiaryName` plus at least IBAN or accountNumber;
  `CRYPTO` requires `accountNumber` (the on-chain address) and
  `transferNetworkId`. Memo is required on chains that need it (XRP, XLM).
- A payout can mix currencies across transfers but each source account in
  the payout must use a single currency. Mixing currencies on the same
  source rejects in the preflight.
- `skipPreflight: true` on `brighty_start_payout` bypasses the local balance
  check. Brighty will still reject the API call if the account is empty,
  but the user loses the per-account shortfall report. Only use when the
  user has explicitly accepted partial-failure risk in writing.
- All ids are strings. Do not parse them.

## When NOT to use this skill

- Listing balances or account details, opening or closing accounts,
  inviting/removing teammates → use `brighty-banking`.
- Issuing or managing cards → use `brighty-cards`.
- Paying a single invoice from a PDF or image (extraction + confirmation
  pipeline) → use `brighty-invoice-pay` (it orchestrates the same payout
  tools but adds OCR/extraction guidance).

## Error handling

Brighty errors arrive as `{ name, message, description, status, code }`.
Surface `description` (or `message`) verbatim — do not rephrase. On 401,
instruct the user to set `BRIGHTY_API_KEY` or run `brighty-mcp login`.

A blocked preflight from `brighty_start_payout` arrives as an MCP error
result whose body is
`{ ok: false, error: "PreflightFailed", message, shortfalls: [{ accountId, currency, required, available, shortfall }] }`.
Show the `shortfalls` list to the user and stop — top-up or
transfer-removal is on them.
