---
name: brighty-banking
description: |
  Manage Brighty business accounts and team members: list accounts and balances,
  open or close accounts, fetch IBAN/SWIFT/crypto routing addresses for inbound
  payments, and invite or remove teammates. Use when the user asks about
  balances, account status, opening or closing an account, sharing deposit
  details, or managing who has access to the Brighty business.
  Triggers: balance, account, IBAN, SWIFT, deposit details, open account, close
  account, invite teammate, add member, remove member, team access.
license: MIT
metadata:
  version: "0.0.2"
  author: brighty
---

# Brighty Banking

Tools to inspect and manage Brighty business accounts and team membership.
Activate this skill when the user wants to know "how much do I have", needs
deposit instructions to share with a counterparty, or is changing who has
access to the business.

## Tools provided

Accounts (5):

- `brighty_list_accounts` — list all accounts. Optional filters: `type`
  (`CURRENT` / `SAVING`) and `holderId`. Returns each account with `id`,
  `type`, `balance: { amount, currency }`, `holderId`, `ownerId`,
  `openedAt`, optional `name`.
- `brighty_get_account` — fetch one account by id.
- `brighty_create_account` — open a new `CURRENT` or `SAVING` account in a
  given `currency`. Optional `name` and `holderId` (defaults to the
  business id).
- `brighty_terminate_account` — close an empty account (POST
  `/accounts/{id}/terminate`). Irreversible.
- `brighty_get_account_addresses` — fetch the routing addresses for an
  account. For fiat: IBAN/BIC/SWIFT, with `type` carrying the rail
  (`INTERNATIONAL` / `LOCAL_EU` / `LOCAL_UK` / `LOCAL_US`) and
  `designation` one of `UNIVERSAL` / `SALARY` / `PERSONAL` / `VOID`. For
  crypto: on-chain `address` (and `memo` when applicable), with `type`
  carrying the network (e.g. `ERC20`, `TON`).

Members (3):

- `brighty_list_members` — list teammates. Optional filter: `withTerminated`
  (boolean). Returns each member as `{ contact, customer, legalData,
membership: { memberId, role, state } }`.
- `brighty_add_members` — invite one or more teammates. Each entry needs
  `email` and `role`; optional KYC pre-fill: `legalName`, `birthInfo`,
  `nationality`. Returns an array of `Membership { memberId, role, state }`.
- `brighty_remove_members` — remove members by id (sends
  `POST /members/remove` with `{ members: [...] }`). Acting key needs
  admin-grade role.

Reference material:

- `references/ACCOUNT_TYPES.md` — when to use `CURRENT` vs `SAVING`,
  supported currencies.
- `references/MEMBER_ROLES.md` — `MEMBER` / `VIEWER` / `PAYER` / `ADMIN` /
  `OWNER`: what each can do; who can invite or remove.

## Core workflows

### Check balances ("how much do I have")

1. Call `brighty_list_accounts`. If the user already named the account
   type, pass `type` to narrow the result. Currency-based filtering is not
   supported by the API — filter the returned array client-side after the
   call if needed.
2. Read `balance.amount` and `balance.currency`. There is no separate
   "available" balance field on the API today; surface `balance` as the
   spendable amount. Quote currency on every line. Never silently sum
   across currencies.
3. If the user asks about a specific account, prefer `brighty_get_account`
   with the id from step 1.

### Open a new account

1. Confirm `type` (`CURRENT` for spending, `SAVING` for vault) and
   `currency` with the user before calling. See
   `references/ACCOUNT_TYPES.md`.
2. Call `brighty_create_account` with `type`, `currency`, and an optional
   `name`. Pass `holderId` only when the account should belong to a
   specific customer that is not the business itself.
3. Report the new `id` so it can be used in follow-up calls.

### Close an account

1. Call `brighty_get_account` first. Refuse to proceed if `balance.amount`
   is not `"0"` — explain to the user how to drain the balance (transfer
   out via the `brighty-payouts` skill).
2. After confirming the account is empty, call `brighty_terminate_account`.
   The API responds with 204 on success. Make clear this is irreversible.

### Share inbound payment details ("how do I receive money into account X")

1. If the user did not name an account, call `brighty_list_accounts` and
   pick by currency, or ask which account.
2. Call `brighty_get_account_addresses` with the chosen `accountId`.
3. For fiat addresses, return `beneficiaryName`, `iban` (or
   `accountNumber`), `bic` (or `swiftCode`), `bankName`, `bankAddress` if
   present, and `reference` only if the API returned one. Show the `type`
   so the recipient knows whether it's `LOCAL_EU` (SEPA), `LOCAL_UK`
   (Faster Payments), `LOCAL_US` (ACH), or `INTERNATIONAL` (SWIFT) — they
   pick the right rail accordingly.
4. For crypto addresses, return `network` (or `type`), `address`, and
   `memo` together. Memo is required on networks that use it (XRP, XLM,
   some others); never present the address without the memo when the API
   returned both.

Never invent fields. If a field is absent in the response, do not show a
placeholder.

### Invite a teammate

1. Confirm the email and the role with the user. Roles: `MEMBER`,
   `VIEWER`, `PAYER`, `ADMIN`, `OWNER`. See `references/MEMBER_ROLES.md`
   for what each can do.
2. Call `brighty_add_members` with one or more entries. Each needs `email`
   and `role`. KYC pre-fills (`legalName`, `birthInfo`, `nationality`)
   speed onboarding when known.
3. Report the returned `memberId` and `state` for each invite. The invitee
   gets an email; their `state` is `INVITED` until they accept.

### Remove a teammate

1. Call `brighty_list_members` to find the `membership.memberId` by
   reading the surrounding contact/legalData fields.
2. Confirm with the user before removing — the operation is irreversible
   (the member can be re-invited later, but loses any in-flight access
   immediately).
3. Call `brighty_remove_members` with one or more `memberIds`. Acting key
   must have an admin-grade role.

## Important behaviours

- Brighty returns money as `{ amount: string, currency: string }`. Treat
  `amount` as a decimal string; never cast to `Number` for arithmetic.
  Forward verbatim when displaying.
- `brighty_terminate_account` returns 204 No Content on success. The tool
  surfaces `{ accountId, status: "TERMINATED" }` to the agent.
- `brighty_add_members` accepts a batch. Prefer one call with multiple
  entries over a loop of single-entry calls.
- The acting API key already represents a single business; there is no
  `businessId` parameter on any tool here.
- All ids are strings (UUID format). Do not parse them.

## When NOT to use this skill

- Moving money between own accounts or to external recipients → use
  `brighty-payouts`.
- Issuing or managing cards → use `brighty-cards`.
- Paying a single invoice from a PDF or image → use `brighty-invoice-pay`.

## Error handling

Brighty returns errors as `{ errorCode, name, description, params? }`.
Surface `description` verbatim to the user — it is the human-readable
text. Do not paraphrase. On 401, instruct the user to set
`BRIGHTY_API_KEY` or run `brighty-mcp login`.
