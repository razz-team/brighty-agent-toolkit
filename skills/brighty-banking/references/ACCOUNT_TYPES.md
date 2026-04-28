# Account types

Brighty exposes two account types via `brighty_create_account`.

## CURRENT

Day-to-day spending account.

- Holds fiat or crypto.
- Can be debited by transfers, payouts, and card spend.
- Can hold deposit instructions (IBAN/SWIFT for fiat, on-chain address for crypto), retrievable via `brighty_get_account_addresses`.
- Cards (`brighty-cards` skill) attach to a CURRENT account, never a SAVING one.

Use this when the user wants an account they can spend from or receive payments into.

## SAVING

Vault / hold account.

- Holds the same currencies as CURRENT.
- Funded by transfers from a CURRENT account in the same business (use `brighty_transfer_intent` + `brighty_transfer_own` from the `brighty-payouts` skill).
- Cannot be the source of an outbound payout or have a card attached.
- Useful for setting aside reserves (tax, payroll buffer, escrow-like holds).

Use this when the user wants to ring-fence funds.

## Currency

`currency` is an ISO-4217 code for fiat (e.g. `EUR`, `USD`, `CHF`, `GBP`) or a supported crypto ticker (e.g. `BTC`, `ETH`, `USDT`). Brighty's exact list of supported tickers changes over time — when in doubt, call `brighty_list_accounts` to see what the business already holds, or attempt creation and surface any error verbatim.

## Status values

`status` on an Account can be:

- `ACTIVE` — usable for both inbound and outbound transactions.
- `PENDING` — opened but not yet provisioned (waiting on rails). Inbound may work; outbound usually does not.
- `BLOCKED` — frozen by Brighty (compliance, fraud, or user-requested). Treat as unusable until the user resolves it in the Brighty app.
- `TERMINATED` — closed. Read-only history.

Filter via `brighty_list_accounts` `status` parameter when the user asks for "active accounts" or "all my accounts including closed".

## Primary account

One account per business is marked `isPrimary: true`. The primary account cannot be terminated. To close the current primary, the user must reassign the primary in the Brighty app first — there is no MCP tool for that, surface this to the user when relevant.
