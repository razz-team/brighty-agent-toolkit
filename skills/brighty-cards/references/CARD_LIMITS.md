# Card spending limits

`brighty_set_card_limits` updates the `daily` and `monthly` spend buckets on
a Brighty card. This file covers the rules that are not obvious from the
tool's input schema alone.

## Buckets

A card has two independent spend buckets:

- **`daily`** — rolling 24-hour spend cap. Resets at the rail's local
  midnight (typically the cardholder's profile timezone).
- **`monthly`** — rolling calendar-month spend cap. Resets on the first of
  the month.

Both are optional on a card. A card with no `daily` limit means
"no daily cap, only monthly applies"; a card with no `monthly` limit means
"no monthly cap, only daily applies". A card with neither is uncommon on
business products — confirm with the user whether they really want
unlimited spend (in practice the rail still enforces network-level fraud
ceilings).

## Money shape

Each bucket is a `Money` object: `{ amount, currency }`.

- `amount` is a decimal string (e.g. `"500.00"`). Never wrap in `Number()`.
- `currency` is ISO-4217 (e.g. `EUR`, `USD`, `CHF`, `GBP`).
- `currency` **must match the card's currency**. Setting a USD limit on an
  EUR card will be rejected by the API. When in doubt, call
  `brighty_get_card` first and read the card's `currency` field.

## Partial replacement

The tool sends only the keys you supply:

| Supplied                 | What happens                                          |
| ------------------------ | ----------------------------------------------------- |
| `daily` only             | `daily` is replaced; `monthly` left at current value. |
| `monthly` only           | `monthly` is replaced; `daily` left at current value. |
| Both `daily` & `monthly` | Both replaced.                                        |
| Neither                  | Tool throws before calling the API.                   |

There is no "clear bucket" sentinel exposed here. If the user wants to
remove a cap entirely, surface that the API does not support that via
this tool and direct them to the Brighty app.

## Validation pitfalls

- **Amount format.** The schema rejects anything that isn't a decimal
  string. Common mistakes:
  - `"1,000.00"` (locale comma) — strip thousands separators before
    sending; pass `"1000.00"`.
  - `"€500"` (currency symbol) — currency goes in `currency`, not
    `amount`.
  - `500` (number) — must be a string.
- **Negative amounts.** The regex allows `-` but the API rejects negative
  limits. Don't send them.
- **Daily > monthly.** The API may reject a `daily` cap larger than the
  `monthly` cap. Sanity-check with the user before sending if they're
  setting a high daily.
- **Currency mismatch.** See above — the API rejects, but the error
  message is generic. Pre-checking saves a round-trip.

## Reading limits back

After a successful `brighty_set_card_limits`, the tool returns the updated
`Card`. Echo `card.limits.daily` and `card.limits.monthly` to the user so
they can confirm. Both fields are optional on the response — if a bucket
is absent, the card has no cap in that bucket.
