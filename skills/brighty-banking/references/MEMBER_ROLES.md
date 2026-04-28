# Member roles

Brighty businesses have four roles. Pick the lowest role that lets the teammate do their job — the principle is least privilege, especially since members can move money once active.

## OWNER

- Full control. Can manage members at any role, including other owners.
- Can close the business.
- Cannot be removed by an ADMIN — only another OWNER can remove an OWNER.
- A business has at least one OWNER at all times.

Use for the founder(s) and other principals. Avoid granting OWNER lightly.

## ADMIN

- Can invite and remove ADMIN, ACCOUNTANT, and EMPLOYEE members.
- Can move money, manage cards, manage accounts.
- Cannot remove or demote OWNERs.

Use for trusted operators / heads of finance who need to act day-to-day without needing the OWNER's password reset.

## ACCOUNTANT

- Read access to balances, transactions, statements.
- Can prepare payouts but cannot start them (typically — verify against the Brighty app for the current matrix).
- Cannot manage members.

Use for external accountants or controllers who need visibility but should not move money on their own.

## EMPLOYEE

- Limited access scoped to a card or a specific account, depending on configuration.
- Cannot manage members or open new accounts.
- Cannot see the full financial picture by default.

Use for staff who need a card or to receive a per-diem balance, not full books access.

## Status values

- `ACTIVE` — accepted the invite, can act per their role.
- `INVITED` — email sent, awaiting acceptance.
- `REMOVED` — historical record. Cannot act. Can be re-invited via `brighty_add_members`.

## Operational notes

- The acting API key represents a single business. The role of the key itself determines what `brighty_remove_members` and `brighty_add_members` can do — keys provisioned for an EMPLOYEE-tier user will get 403 on these.
- `brighty_add_members` accepts a batch; one call with multiple invitations is preferred.
- When the user asks to "make X an admin", there is no role-change tool exposed via MCP today. Direct the user to do it in the Brighty app, or remove and re-invite at the new role (note that this resets any per-card or per-account configuration the member had).
