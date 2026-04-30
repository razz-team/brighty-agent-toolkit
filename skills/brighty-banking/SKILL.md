---
name: brighty-banking
description: |
  Manage Brighty business accounts and team members: list accounts and balances,
  open or close accounts, fetch IBAN/SWIFT details for inbound payments, and
  invite or remove teammates. Use when the user asks about balances, account
  status, opening or closing an account, sharing deposit details, or managing
  who has access to the Brighty business.
  Triggers: balance, account, IBAN, SWIFT, deposit details, open account, close
  account, invite teammate, add member, remove member, team access.
license: MIT
metadata:
  version: "0.0.1"
  author: brighty
---

# Brighty Banking

Tools to inspect and manage Brighty business accounts and team membership.
Activate this skill when the user wants to know "how much do I have", needs
deposit instructions to share with a counterparty, or is changing who has
access to the business.

## Tools provided

Accounts (5):

- `brighty_list_accounts` — list all accounts with balances; supports `status`, `type`, `currency` filters.
- `brighty_get_account` — fetch one account by id.
- `brighty_create_account` — open a new `CURRENT` or `SAVING` account in a given currency.
- `brighty_terminate_account` — close an empty, non-primary account. Irreversible.
- `brighty_get_account_addresses` — fetch deposit details for an account: IBAN/BIC/SWIFT for fiat, on-chain address (and memo where applicable) for crypto.

Members (3):

- `brighty_list_members` — list teammates; supports `status` and `role` filters.
- `brighty_add_members` — invite one or more teammates by email with a role.
- `brighty_remove_members` — remove members by id. Acting key needs admin-grade role.

Reference material:

- `references/ACCOUNT_TYPES.md` — when to use `CURRENT` vs `SAVING`, supported currencies.
- `references/MEMBER_ROLES.md` — what each role can do; who can invite or remove.

## Core workflows

### Check balances ("how much do I have")

1. Call `brighty_list_accounts`. If the user already named a currency or product, pass `currency` or `type` to narrow the result.
2. Read `balance` and `availableBalance` (the latter is what the user can actually spend; pending holds reduce it). Report in the account's `currency`.
3. If the user asks about a specific account, prefer `brighty_get_account` with the id from step 1 — it returns the same shape but is cheaper and easier to summarise.

Always quote the currency on every amount. Never silently sum across currencies.

### Open a new account

1. Confirm `type` (CURRENT for spending, SAVING for vault) and `currency` with the user before calling. See `references/ACCOUNT_TYPES.md`.
2. Call `brighty_create_account` with `type`, `currency`, and an optional `name`.
3. Report the new `id` so it can be used in follow-up calls.

### Close an account

1. Call `brighty_get_account` first. Refuse to proceed if `balance.amount` is not `"0"` or if `isPrimary` is true — explain to the user how to drain the balance (transfer out via the `brighty-payouts` skill) or reassign the primary account in the Brighty app.
2. After confirming the account is empty and not primary, call `brighty_terminate_account`. Make clear this is irreversible.

### Share inbound payment details ("how do I receive money into account X")

1. If the user did not name an account, call `brighty_list_accounts` and pick by currency, or ask which account.
2. Call `brighty_get_account_addresses` with the chosen `accountId`.
3. For fiat accounts, return `beneficiaryName`, `iban` (or `accountNumber`), `bic` (or `swiftCode`), `bankName`, and `bankAddress` if present. Include `reference` only if the API returned one — Brighty sometimes requires a reference string for correct routing.
4. For crypto accounts, return `network`, `address`, and `memo` together. Memo is required on networks that use it (e.g. some XRP/XLM/EOS-style chains); never present the address without the memo when the API returned both.

Never invent fields. If a field is absent in the response, do not show a placeholder.

### Invite a teammate

1. Confirm the email and the role with the user. Roles: `OWNER`, `ADMIN`, `ACCOUNTANT`, `EMPLOYEE`. See `references/MEMBER_ROLES.md` for what each can do.
2. Call `brighty_add_members` with one or more invitations. Each invitation needs `email` and `role`; `name` is optional.
3. Report which invitations were sent. The invitee receives an email; their `status` is `INVITED` until they accept.

### Remove a teammate

1. Call `brighty_list_members` to find the member id by email or name.
2. Confirm with the user before removing — the operation is irreversible (the member can be re-invited later, but loses any in-flight access immediately).
3. Call `brighty_remove_members` with one or more `memberIds`.

## Important behaviours

- Brighty returns money as `{ amount: string, currency: string }`. Treat `amount` as a decimal string; never cast to `Number` for arithmetic. Forward verbatim when displaying.
- `terminate_account` will fail if the account has any balance, including pending. Surface the failure verbatim — do not paper over it.
- `add_members` accepts a batch. Prefer one call with multiple invitations over a loop of single-invitation calls.
- The acting API key already represents a single business; there is no `businessId` parameter on any tool here.
- All ids are strings. Do not parse them.

## When NOT to use this skill

- Moving money between own accounts or to external recipients → use `brighty-payouts`.
- Issuing or managing cards → use `brighty-cards`.
- Paying a single invoice from a PDF or image → use `brighty-invoice-pay`.

## Error handling

Brighty errors arrive as `{ name, message, description, status, code }`. Surface `description` (or `message` if absent) verbatim to the user; do not rephrase. On 401, instruct the user to set `BRIGHTY_API_KEY` or run `brighty-mcp login`.
