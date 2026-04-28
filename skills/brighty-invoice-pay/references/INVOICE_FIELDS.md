# Invoice fields to extract

This is the canonical list of fields the agent should pull off a single
invoice (PDF, image, or pasted text) and how each one maps onto
`brighty_create_external_transfer` arguments. Use this as a checklist while
reading the document; show the user every populated field in the
pre-create confirmation step (see `CONFIRMATION_TEMPLATE.md`).

## Fiat invoices (SEPA / SWIFT / ACH)

The vast majority of supplier invoices fall here.

### Required

| Invoice field        | Maps to                       | Notes                                                                                                                                    |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Recipient legal name | `beneficiary.beneficiaryName` | Use the legal entity name on the invoice header (e.g. "ACME GmbH"), not the trading name. Max 140 chars.                                 |
| IBAN (preferred)     | `beneficiary.iban`            | Strip whitespace. Validate the country prefix matches the supplier address.                                                              |
| or Account number    | `beneficiary.accountNumber`   | Use only if the invoice does not provide an IBAN (ACH, some local rails).                                                                |
| Total due (amount)   | `amount.amount`               | Decimal string verbatim. Strip thousands separators. Use the "Total" / "Amount due" / "Balance due" line — not the sub-total before tax. |
| Currency             | `amount.currency`             | ISO-4217 from the invoice header or the currency symbol on the total line.                                                               |

### Often required (rail-dependent)

| Invoice field       | Maps to                                     | Notes                                                                                                                      |
| ------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| BIC / SWIFT code    | `beneficiary.bic` / `beneficiary.swiftCode` | 8 or 11 chars. Required for SWIFT; often required for SEPA when IBAN alone is not enough.                                  |
| Routing number      | `beneficiary.routingNumber`                 | US ABA routing for ACH/Fedwire.                                                                                            |
| Bank name           | `beneficiary.bankName`                      | Some rails reject without a bank name even when BIC is present.                                                            |
| Beneficiary address | `beneficiary.beneficiaryAddress`            | Required for many SWIFT corridors and high-value SEPA Instant. Use the supplier's billing address from the invoice header. |
| Invoice number      | `reference` (top-level on the transfer)     | Statement memo. Suppliers reconcile by it. Keep ≤140 chars. If absent, ask the user.                                       |

### Recommended

| Invoice field | Maps to                                 | Notes                                                                               |
| ------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| (always set)  | `beneficiary.isBusinessRecipient: true` | Supplier invoices are by definition B2B. Helps AML routing pick the right category. |

### Informational only — show but do not act on

| Invoice field           | What to do                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Due date                | Show in the confirmation block. Do not delay the transfer to match it; that is the user's call. |
| Issue date              | Show in the confirmation block.                                                                 |
| Invoice line items      | Do not transmit. The transfer carries one `amount` and one `reference` only.                    |
| Tax breakdown (VAT/GST) | Already included in the total. Confirm the total matches the post-tax line.                     |

## Crypto invoices (rare for B2B)

Usually a wallet address pasted in an email or shown as a QR code in a PDF.

### Required

| Invoice field    | Maps to                         | Notes                                                                                                               |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| On-chain address | `beneficiary.accountNumber`     | Validate format against the network (e.g. BTC starts with `bc1`/`1`/`3`; ETH is 0x + 40 hex). Reject if mismatched. |
| Network          | `beneficiary.transferNetworkId` | `BTC`, `ETH`, `TRX`, etc. Must match the source account's asset.                                                    |
| Amount           | `amount.amount`                 | Decimal string. Crypto can have up to 18 decimal places.                                                            |
| Currency / asset | `amount.currency`               | Asset ticker (`BTC`, `ETH`, `USDT`, …).                                                                             |

### Often required

| Invoice field          | Maps to                       | Notes                                                                                                                       |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Memo / destination tag | `beneficiary.memo`            | Required on chains that route by memo (XRP, XLM, EOS-style). Never omit when the invoice supplies one — funds will be lost. |
| Recipient name         | `beneficiary.beneficiaryName` | Recommended for AML records; some regulated rails require it.                                                               |
| Reference / order id   | `reference`                   | If the invoice has one. Many crypto invoices do not.                                                                        |

## Common extraction pitfalls

- **Sub-total vs total.** Invoices often show the pre-tax sub-total
  prominently. Always pay the post-tax "Total due" / "Balance due" line.
  If both look the same, the invoice has zero VAT — fine.
- **Thousands separators and decimal commas.** European invoices use
  `.` as thousands separator and `,` as decimal point (`1.234,56`).
  US invoices use `,` and `.` (`1,234.56`). Normalise to `1234.56`
  before sending. Never send `Number()` output — keep the string.
- **Currency from symbol.** `€` → `EUR`, `$` → ambiguous (could be USD,
  CAD, AUD, …). If only a `$` is shown and the supplier address is
  outside the US, ask the user. Do not assume USD.
- **IBAN whitespace.** IBANs are commonly printed in groups of four
  (`DE89 3704 0044 0532 0130 00`). Strip spaces before sending.
- **OCR look-alikes.** `0` vs `O`, `1` vs `l` vs `I`, `8` vs `B`, `2` vs
  `Z` get misread on low-quality scans. After extraction, re-check digits
  in the IBAN and amount; if confidence is low, ask the user to confirm
  the IBAN character-by-character before proceeding.
- **Multiple bank lines.** Some invoices list both an IBAN and an ABA
  routing number for international flexibility. Pick the one that matches
  the supplier's primary country and the source account's reachability.
  When unsure, ask the user.
- **Stale invoices reused.** If the user pastes a screenshot but the
  amount looks like a balance summary instead of a single invoice, ask.
- **Invoice in a different currency than the source account.** Stop and
  tell the user; do not auto-FX from this skill (see SKILL.md "When NOT
  to use this skill").

## Missing or ambiguous fields

If a required field is missing from the invoice (no IBAN at all, no
clear total, ambiguous currency, etc.), do not guess — ask the user for
the specific value. Mention which field is missing and why you cannot
proceed without it.

If an "often required" field for the chosen rail is missing (e.g. SWIFT
without a BIC), warn the user that the rail typically rejects without it
and offer to either (a) ask the supplier or (b) attempt anyway and
surface the rail error.
