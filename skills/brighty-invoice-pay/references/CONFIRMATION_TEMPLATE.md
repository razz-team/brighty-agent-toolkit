# Pre-create and post-create confirmation templates

The skill has two confirmation steps and they are not the same. Both must
run before `brighty_start_payout`. Skipping either one is the failure mode
this skill exists to prevent.

- **Pre-create** (step 3 in SKILL.md): show the user the extracted fields
  and the chosen source account _before_ anything is created in Brighty.
  Catches OCR mistakes before any API state is created.
- **Post-create** (step 4.3 in SKILL.md): show the user what Brighty
  echoed back from `brighty_get_payout` _after_ the transfer is staged
  but _before_ commit. Catches the rare cases where the transfer schema
  silently coerced or dropped a field.

## Pre-create template (fiat)

Render exactly the lines that have a value. Omit lines whose field is
absent — do not show "N/A". Quote the supplier name and reference.

```
Ready to pay this invoice?

Supplier:    "ACME GmbH"
Invoice ref: "INV-2026-0421"
Amount:      1234.56 EUR
Due date:    2026-05-15

Recipient bank:
  IBAN:      DE89 3704 0044 0532 0130 00
  BIC:       COBADEFFXXX
  Bank:      Commerzbank AG
  Address:   Hauptstr. 1, 10117 Berlin, Germany

Pay from:
  Account:   "EUR Operations" (CURRENT, EUR)
  ID:        acc_01H...
  Available: 8421.00 EUR

Reply 'yes' to create the payout, or correct any field above.
```

Notes:

- Group IBAN digits in fours for human readability. The actual API call
  sends the IBAN with whitespace stripped — the readability grouping is
  display-only.
- Show `amount` as a decimal string. Do not use locale formatting; do
  not insert thousands separators on display either, to avoid creating
  ambiguity with European decimal-comma conventions.
- Show the source account's `availableBalance` so the user can
  eyeball-check that it covers the transfer. The actual preflight runs
  later in `brighty_start_payout`.
- If `beneficiaryAddress` was not on the invoice, omit the "Address:"
  line. Do not invent one.

## Pre-create template (crypto)

```
Ready to pay this invoice?

Supplier:    "ExampleCorp"
Invoice ref: "ord_42"   (omit line if absent)
Amount:      0.05 BTC

Recipient:
  Network:   BTC
  Address:   bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq
  Memo:      (only show if present — REQUIRED on XRP/XLM/etc.)

Pay from:
  Account:   "BTC Treasury" (CURRENT, BTC)
  ID:        acc_01H...
  Available: 0.21 BTC

Reply 'yes' to create the payout, or correct any field above.
```

Crypto-specific notes:

- For chains that route by memo, mark the memo line as REQUIRED in the
  display so the user notices if it was extracted vs assumed.
- Show the address character-for-character. Do not abbreviate
  (`bc1qar0…wf5mdq`) — the user must see the full string to verify.

## Waiting for the user

After rendering, wait for an explicit confirmation token: "yes", "go",
"confirm", "ok pay it", or similar affirmative. Do not infer consent
from earlier instructions in the conversation.

If the user corrects a field ("the IBAN should end in …01", "amount is
1243.56 not 1234.56"), update the field, **re-render the entire block**
with the correction applied, and wait again. Do not proceed on a
diff-only confirmation.

If the user wants to change the source account, re-run step 2 of the
pipeline (call `brighty_list_accounts` again with the new currency or
the user's account name) and re-render.

## Post-create template (after `brighty_get_payout`)

This is the second confirmation. Brighty has now stored the transfer.
Show what Brighty echoed back, not what was originally extracted — they
should match, and any mismatch indicates a bug.

```
Payout staged. Final check before committing:

Payout:        "Pay ACME invoice INV-2026-0421"
ID:            payout_01H...
Status:        DRAFT
Transfer count: 1
Total:         1234.56 EUR

Transfer details (as Brighty stored them):
  Recipient:  ACME GmbH
  IBAN:       DE89370400445320130000
  Amount:     1234.56 EUR
  Reference:  INV-2026-0421
  Source:     acc_01H...

Reply 'commit' to start the payout (funds will move), or 'cancel' to
abandon this DRAFT.
```

Notes:

- Show the IBAN as Brighty returned it (no spaces). The pre-create view
  used spaced grouping for readability; the post-create view shows the
  stored value, so any whitespace stripping issue surfaces here.
- Show `transferCount` explicitly. If it is not exactly 1, something
  went wrong — stop and report rather than committing.
- Show `totalsByCurrency` (or the single total). Mismatches against the
  pre-create amount indicate a parsing bug; do not commit.

If the user says "commit" / "yes" / "go", call `brighty_start_payout`.

If they say "cancel" / "stop", do not call `brighty_start_payout`. The
DRAFT payout is left untouched in Brighty (there is no MCP-exposed
cancel today); tell the user it will sit in DRAFT and can be resumed or
abandoned later via the Brighty app.

## After commit

On success, show the returned status from `brighty_start_payout`
(typically `RUNNING` immediately, settling to `COMPLETED` later). Give
the payout id so the user can follow up via `brighty_get_payout` or the
Brighty app.

On a blocked preflight (MCP error result with body
`{ ok: false, error: "PreflightFailed", message, shortfalls: [...] }`),
surface the per-account `shortfalls` list verbatim:

```
Cannot start: source account is short.

  acc_01H...  required 1234.56 EUR, available 800.00 EUR
              (short 434.56 EUR)

Top up the account or correct the invoice and run again.
```

On any other Brighty error, surface `description` (or `message`)
verbatim — do not rephrase.
