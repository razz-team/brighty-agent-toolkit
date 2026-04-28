# Recipient list format for batch payouts

Batch payroll and supplier payouts are typically driven from a CSV, an Excel
sheet, or a free-form pasted list. The shape below maps directly to
`brighty_create_external_transfer` arguments — extract these fields whether
the source is a CSV, a spreadsheet, or an email of bank details.

## Fiat recipients (SEPA / SWIFT / ACH)

Required:

| Column              | Maps to                                          | Notes                                                                                    |
| ------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `name`              | `beneficiary.beneficiaryName`                    | Full legal name. For payroll, the employee's legal name (not nickname). Max 140 chars.   |
| `iban` or `account` | `beneficiary.iban` / `beneficiary.accountNumber` | IBAN for SEPA / SWIFT-with-IBAN; `accountNumber` for ACH and other local rails.          |
| `amount`            | `amount.amount`                                  | Decimal string, e.g. `"3500.00"`. Never cast to a number — keep it as text.              |
| `currency`          | `amount.currency`                                | ISO-4217 (`EUR`, `USD`, `GBP`, `CHF`...). All rows for one source account must match it. |

Often required (rail-dependent):

| Column               | Maps to                                     | Notes                                                                                          |
| -------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bic` / `swift`      | `beneficiary.bic` / `beneficiary.swiftCode` | 8 or 11 chars. Required for SWIFT; optional for SEPA when IBAN includes the country bank code. |
| `routingNumber`      | `beneficiary.routingNumber`                 | US ABA routing for ACH/Fedwire.                                                                |
| `bankName`           | `beneficiary.bankName`                      | Some rails reject without a bank name even when BIC is present.                                |
| `beneficiaryAddress` | `beneficiary.beneficiaryAddress`            | Required for many SWIFT corridors and high-value SEPA Instant.                                 |
| `reference`          | `reference` (top-level on the transfer)     | Statement memo. Keep ≤140 chars. For payroll, e.g. `"April 2026 salary"`.                      |

Optional but recommended:

| Column                | Maps to                           | Notes                                                                                       |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `isBusinessRecipient` | `beneficiary.isBusinessRecipient` | `true` for vendors/companies, `false` for individuals (incl. employees). Helps AML routing. |

## Crypto recipients

Required:

| Column     | Maps to                         | Notes                                                                                        |
| ---------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| `address`  | `beneficiary.accountNumber`     | On-chain destination address. Validate format against `transferNetworkId` before submitting. |
| `network`  | `beneficiary.transferNetworkId` | `BTC`, `ETH`, `TRX`, etc. Must match the source account's asset.                             |
| `amount`   | `amount.amount`                 | Decimal string. Crypto can have up to 18 decimal places.                                     |
| `currency` | `amount.currency`               | Asset ticker (`BTC`, `ETH`, `USDT`...).                                                      |

Often required:

| Column         | Maps to                       | Notes                                                                                  |
| -------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| `memo` / `tag` | `beneficiary.memo`            | Required on chains that route by memo (XRP, XLM, EOS-style). Never omit when supplied. |
| `name`         | `beneficiary.beneficiaryName` | Recommended for AML records on regulated rails.                                        |

## Common pitfalls

- **Mixed currencies on one source.** A payout can hold transfers in
  multiple currencies, but each source account inside the payout must stick
  to a single currency. The preflight in `brighty_start_payout` rejects mixed
  currencies on the same source. Split into one payout per source-currency
  pair.
- **Amount is a decimal string.** `"3500"`, `"3500.00"`, and `"3,500.00"` are
  not equivalent. Strip thousands separators and emit `"3500.00"`. Never
  send `3500` (number) — the schema rejects it.
- **Per-row currency, not per-payout.** Don't infer the currency from a
  single header — every row carries its own currency in the schema.
- **One payout, many transfers.** Always wrap the batch in a single
  `brighty_create_payout` and add transfers to it; don't create one payout
  per recipient.
- **IBAN vs accountNumber.** Use IBAN where the country supports it. Fall
  back to `accountNumber` only for rails (ACH, some emerging-market local
  rails) where IBAN is not issued.
- **Trim whitespace.** IBANs are commonly pasted with spaces; remove them
  before sending.

## Confirmation step before `brighty_start_payout`

After all transfers are added, call `brighty_get_payout` and present:

- `payout.name`, `payout.id`
- `payout.transfersCount` and `payout.totalsByCurrency`
- The first 3-5 rows: recipient name, masked IBAN/address, amount, currency
- A reminder that the source account's available balance must cover each
  per-source total (the preflight will check, but the user should see the
  numbers first)

Only call `brighty_start_payout` after the user explicitly confirms.
