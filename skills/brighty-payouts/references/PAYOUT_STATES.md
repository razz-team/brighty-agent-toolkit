# Payout and transfer lifecycle

Brighty payouts and the transfers attached to them have separate lifecycle
state machines. This file lists every value the API can return and what each
implies for further actions.

## Payout status

`payout.status` is one of:

### DRAFT

Empty or partially populated container. No money has moved.

- **Allowed:** add transfers (`brighty_create_internal_transfer`,
  `brighty_create_external_transfer`), inspect (`brighty_get_payout`), commit
  (`brighty_start_payout`).
- **Not allowed (or no-op):** there is no "remove transfer" or "cancel" tool
  exposed via MCP at this layer; if the user wants to drop a transfer, the
  current path is to abandon the DRAFT payout (don't start it) and create a
  fresh one.
- **Default state** after `brighty_create_payout`.

### RUNNING

`brighty_start_payout` has been accepted by Brighty; transfers are being
processed. Some may have already settled; others are still queued.

- Inspect via `brighty_get_payout` — transfer-level statuses tell the real
  story.
- Do not retry `brighty_start_payout` on a RUNNING payout.

### COMPLETED

All transfers in the payout reached `COMPLETED`.

- Read-only. Use `brighty_get_payout` to retrieve the final record for
  reconciliation.

### FAILED

The payout finished, but at least one transfer ended in `FAILED`. Other
transfers in the payout may have settled.

- Read-only at the payout level. Failed transfers are not automatically
  retried — the user creates a new payout for the missed recipients.
- Inspect each transfer's `failureReason` via `brighty_get_payout`.

### CANCELLED

The payout was cancelled before any transfer was committed (or while in
DRAFT). Treat as terminal.

- Read-only.
- The MCP tools do not expose a cancel action; cancellation is initiated
  in the Brighty app or by support.

## Transfer status (per transfer inside a payout)

`payoutTransfer.status` is one of:

### PENDING

Staged inside a DRAFT payout, or queued after the payout started but not yet
picked up by the rail. No money has left the source account.

### PROCESSING

The rail (SEPA, SWIFT, on-chain, internal Brighty rail) has accepted the
transfer and is settling it. Funds are typically already debited from the
source account but not yet credited at the destination.

- For on-chain transfers, this includes the time waiting for confirmations.
- Do not assume idempotency-key replay will help here — the transfer is in
  flight. Wait or contact support.

### COMPLETED

Settled. Funds delivered. `updatedAt` reflects the settlement time.

### FAILED

The rail rejected or returned the transfer. `failureReason` is populated.

- Funds typically returned to the source account, but verify via the
  banking skill's `brighty_get_account` after the fact.
- The transfer is terminal — to retry, create a new transfer in a new
  DRAFT payout (with a fresh idempotency key).

### CANCELLED

Cancelled before processing started. Funds untouched. Terminal.

## Own-transfer status (FX between own accounts)

`brighty_transfer_own` returns an `OwnTransfer` whose `status` is one of:
`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`. Same semantics as the payout
transfer states above. Own transfers do not have a separate `CANCELLED`
state — they either complete or fail.

## What the agent should do per state

| state      | reportable to user                                | next action                                                                    |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| DRAFT      | "Staged but not started"                          | add more transfers, or `brighty_start_payout` after user confirms              |
| RUNNING    | "In flight, N of M settled"                       | re-fetch with `brighty_get_payout` if the user wants an update; do not restart |
| COMPLETED  | "Done. Total moved: X by currency"                | nothing                                                                        |
| FAILED     | "Some transfers failed. See per-transfer reasons" | surface `failureReason` per failed transfer; offer to retry the failed subset  |
| CANCELLED  | "Cancelled. No money moved"                       | nothing                                                                        |
| PENDING    | "Queued"                                          | wait or commit the payout; do not create a duplicate                           |
| PROCESSING | "Settling"                                        | wait; do not retry                                                             |

## Idempotency and retries

Every `brighty_create_internal_transfer` and `brighty_create_external_transfer`
call carries an idempotency key (auto-generated UUIDv4 if omitted). To retry a
failed creation, **reuse the same key** — Brighty will return the original
result rather than create a duplicate. To intentionally create a second,
distinct transfer to the same recipient, generate a fresh key (or omit the
arg so a new UUIDv4 is used).

Idempotency keys are scoped to creation. Once a transfer is in `PROCESSING`
or `COMPLETED`, the idempotency key has done its job — there is no rail-level
retry under the hood.
