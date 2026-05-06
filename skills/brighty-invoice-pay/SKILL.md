---
name: brighty-invoice-pay
description: |
  Pay a single supplier invoice from a PDF, image, or pasted text via Brighty:
  extract recipient name, IBAN/BIC or on-chain address, amount, currency, and
  reference; show the user a one-screen confirmation with the resolved fields
  and source account; then create a single-transfer payout and commit. Use
  when the user shares one invoice (file, screenshot, email body, or
  describes one) and asks to pay it. For batch payroll or multi-recipient
  CSV/Excel runs, use brighty-payouts instead.
  Triggers: invoice, pay this invoice, pay supplier, vendor bill, AWS bill,
  Stripe invoice, attached PDF, IBAN payment, wire this, pay from screenshot.
license: MIT
metadata:
  version: "0.0.3"
  author: brighty
---

# Brighty Invoice Pay

End-to-end pipeline to pay a single invoice from a document or pasted bank
details. This skill does not introduce new MCP tools — it orchestrates the
existing payout tools (`brighty_list_accounts`, `brighty_create_payout`,
`brighty_create_external_transfer`, `brighty_get_payout`,
`brighty_start_payout`) around an extraction + explicit confirmation step
so the user always sees the final field map before any money moves.

Activate this skill when the user shares one invoice (PDF, image,
screenshot, forwarded email, or pasted text) and asks to pay it. For
multi-recipient CSV/Excel runs use `brighty-payouts` instead — that skill
is built around batches.

## Tools used

This skill calls only existing tools; it does not register new ones.

- `brighty_list_accounts` (banking) — pick the source account when the
  user did not name one. Filter the returned array client-side by
  `balance.currency` to match the invoice (the API has no currency
  query param).
- `brighty_create_payout` (payouts) — open a `CREATED` container with a
  descriptive `name`, e.g. "Pay AWS invoice 4321". **Capture the
  returned `id` AND `createdAt` — both are required by every follow-up
  call.**
- `brighty_create_external_transfer` (payouts) — add the single
  transfer. `beneficiary.kind: "FIAT"` for IBAN/BIC/account-number
  rails; `beneficiary.kind: "CRYPTO"` for on-chain addresses. Pass
  `payoutCreatedAt` (the value captured above) — the Brighty API
  rejects without it.
- `brighty_get_payout` (payouts) — re-fetch the payout immediately
  before the confirmation step so the user sees what Brighty stored.
  Pass `payoutId` + `createdAt`.
- `brighty_start_payout` (payouts) — final commit. Pass `payoutId` +
  `createdAt`. Runs the local preflight balance check; surface its
  `shortfalls` verbatim if it fails. Returns `{ ok: true }` on success.

## Reference material

- `references/INVOICE_FIELDS.md` — exact list of fields to extract from
  the invoice and how each maps onto `brighty_create_external_transfer`
  arguments.
- `references/CONFIRMATION_TEMPLATE.md` — the shape of the message to
  show the user before calling `brighty_start_payout`. Do not skip it.

## The pipeline

Five steps, in order. Do not re-order or skip steps 3 and 4 — they are
how the user catches OCR mistakes before money moves.

### 1. Extract fields from the invoice

Read the invoice (PDF, image, pasted text). Pull out, at minimum:

- `recipientName` — full legal name of the supplier
- `iban` (preferred) or `accountNumber` — recipient account
- `bic` / `swiftCode` — required for SWIFT, often required for SEPA
- `amount` — total due, as a decimal string (do not cast to a number)
- `currency` — ISO-4217 code on the invoice (`EUR`, `USD`, `GBP`, `CHF`, …)
- `reference` — invoice number or supplier-supplied reference string
- `beneficiaryAddress` — postal address of the supplier when present;
  required for many SWIFT corridors
- `dueDate` — informational only; surface to the user but do not act on it

For crypto invoices (rare for B2B — usually a wallet address pasted in an
email):

- `address` — on-chain destination
- `network` — `BTC`, `ETH`, `TRX`, etc. (maps to `transferNetworkId`)
- `currency` — asset ticker (`BTC`, `ETH`, `USDT`, …)
- `amount` — decimal string
- `memo` — destination tag for chains that route by memo (XRP, XLM)

See `references/INVOICE_FIELDS.md` for the exact field list, mapping to
tool arguments, and what to do when something is missing or ambiguous.

### 2. Pick the source account

If the user named an account, use it. Otherwise:

1. Call `brighty_list_accounts` (no currency filter exists; you'll get
   them all). Filter the result client-side by `balance.currency ===`
   invoice currency.
2. If exactly one matching `CURRENT` account is returned, propose it.
3. If multiple match, ask the user. Never pick silently when ambiguous.
4. If none match (no account in the invoice currency), stop and tell the
   user. Do not auto-FX — that requires the `brighty-payouts` skill's
   `brighty_transfer_intent` + `brighty_transfer_own` flow first, and
   the user must consent to the rate.

### 3. Show the user the proposed transfer (pre-payout confirmation)

Before creating any Brighty objects, show the user a single message with
all extracted fields, the source account, and the resolved amount. See
`references/CONFIRMATION_TEMPLATE.md` for the exact shape.

Wait for an explicit "yes / go ahead / confirm". Do not infer consent
from silence or from earlier "pay this" instructions — the user must
confirm after seeing the resolved fields.

If the user corrects a field, update it and re-show the full block. Do
not proceed on a partial diff.

### 4. Create the payout, add the transfer, re-confirm

Only after step 3:

1. `brighty_create_payout` with a descriptive `name`, e.g.
   `"Pay <supplier> invoice <reference>"`. **Capture both `id` (as
   `payoutId`) and `createdAt` (as `payoutCreatedAt`).**
2. `brighty_create_external_transfer` with the extracted fields:
   - `payoutId` from step 1
   - `payoutCreatedAt` from step 1 (the API rejects without this)
   - `sourceAccountId` from step 2
   - `amount: { amount: "<decimal-string>", currency: "<ISO>" }`
   - `beneficiary` per `kind`
   - `reference` (the invoice number)
     Capture the returned `idempotencyKey` — keep it for any retry.
3. `brighty_get_payout` with `payoutId` + `createdAt`. Show the user the
   stored `payout.totalTransfers` (must be 1), `payout.totalAmount`,
   and the recipient line as Brighty echoed it back. This catches the
   "I sent the wrong IBAN" class of mistake before commit.

### 5. Commit

After the user re-confirms on the post-create view from step 4.3, call
`brighty_start_payout` with `payoutId` + `createdAt`.

- On success, the tool returns `{ ok: true }` (the API itself returns
  204). Report success to the user with the payout id.
- On a blocked preflight (MCP error result with body
  `{ ok: false, error: "PreflightFailed", message, shortfalls: [...] }`),
  surface the per-account `shortfalls` list verbatim and stop. Do not
  retry with `skipPreflight: true` unless the user explicitly says so in
  writing — losing the per-account shortfall report on a single-transfer
  invoice is rarely worth the risk.
- On a Brighty API error, surface `description` (the human text)
  verbatim.

## Critical patterns

**Always extract, then confirm, then create.** The biggest failure mode
is an OCR mistake on an IBAN or amount that the user only sees after
Brighty has already initiated the transfer. The two confirmation steps
(pre-create and post-create) are the controls — do not collapse them.

**Never paraphrase amounts or IBANs in the confirmation.** Show them
character-for-character as extracted. Group IBAN digits in fours for
readability but do not change the digits. Show `amount` as a decimal
string verbatim — never `Number()` it.

**One invoice = one payout = one transfer.** If the user pastes two
invoices in the same message, treat them as two separate runs. Do not
batch them into a single payout from this skill — that is what
`brighty-payouts` is for, and the user has not asked for batch semantics.

**Use the invoice number as `reference`.** Suppliers reconcile by it. If
the invoice has no number, ask the user for one rather than inventing
text.

## Important behaviours

- Money is `{ amount: string, currency: string }`. Treat `amount` as a
  decimal string. Strip thousands separators (`"1,234.56"` →
  `"1234.56"`) before sending; never cast to a number.
- Trim whitespace from IBANs (`"DE89 3704 0044 …"` → `"DE89370400…"`)
  before sending; the schema does not auto-strip.
- `brighty_create_external_transfer` discriminates on `beneficiary.kind`.
  `FIAT` requires `beneficiaryName` plus at least `iban` or
  `accountNumber`. `CRYPTO` requires `accountNumber` (the on-chain
  address) and `transferNetworkId`. `memo` is required on chains that
  route by memo. Alternatively, pass a saved `beneficiaryId` instead of
  an inline beneficiary.
- Set `beneficiary.isBusinessRecipient: true` for supplier invoices —
  they are by definition B2B. This helps the AML routing pick the right
  category.
- The Brighty API requires `Idempotency-Key` on
  `POST /payouts/{id}/transfers/external` — the tool generates a
  UUIDv4 per call when not supplied. Keep the returned key on retries.
- The Brighty API also requires `createdAt` (the payout's timestamp) as
  a query param on `POST /payouts/{id}/transfers/external`,
  `GET /payouts/{id}`, and `POST /payouts/{id}/start`. Always capture
  `createdAt` from `brighty_create_payout` and pass it through.
- Currency on the invoice must match the source account's
  `balance.currency`. If they differ, stop and ask the user — do not
  auto-FX from this skill.

## When NOT to use this skill

- Multi-recipient batch (CSV/Excel/payroll) → `brighty-payouts`.
- "Convert EUR to USD on my savings account" → `brighty-payouts`'s
  `brighty_transfer_intent` + `brighty_transfer_own` flow.
- Internal Brighty-to-Brighty transfer to a Brighty username →
  `brighty-payouts`'s `brighty_create_internal_transfer` inside a
  payout.
- Reading balances, opening accounts, inviting members →
  `brighty-banking`.
- Issuing or freezing cards → `brighty-cards`.

## Error handling

Brighty returns errors as `{ errorCode, name, description, params? }`.
Surface `description` (the human text) verbatim — do not rephrase. On
401, instruct the user to set `BRIGHTY_API_KEY` or run `brighty-mcp
login`.

A blocked preflight from `brighty_start_payout` arrives as an MCP error
result whose body is
`{ ok: false, error: "PreflightFailed", message, shortfalls: [{ accountId, currency, required, available, shortfall }] }`.
Show the `shortfalls` list to the user verbatim and stop. Top-up of the
source account is on them.
