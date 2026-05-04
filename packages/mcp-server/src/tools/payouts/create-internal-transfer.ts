import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { BrightyClient } from "../../api/client.js";
import type { Account, TransferPostponedResponse } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const moneySchema = z.object({
  amount: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, "amount must be a decimal string like '100.00'")
    .describe("Decimal amount as a string, e.g. '100.00'."),
  currency: z
    .string()
    .min(3)
    .max(8)
    .describe("ISO-4217 currency or supported crypto ticker, e.g. EUR or BTC."),
});

export const createInternalTransferInputSchema = z.object({
  payoutId: z
    .string()
    .min(1)
    .describe("Brighty payout id (in CREATED state) the transfer will be added to."),
  sourceAccountId: z.string().min(1).describe("Brighty account id the funds come from."),
  amount: moneySchema.describe(
    "Amount and currency to send. Currency must match the source account's currency; this tool does not perform FX.",
  ),
  receiverUsername: z
    .string()
    .min(1)
    .describe(
      "Recipient's Brighty username (the @-tag on the recipient's profile). Not a customer/account id.",
    ),
  comment: z
    .string()
    .min(1)
    .max(140)
    .optional()
    .describe("Optional free-form comment shown on both sides."),
  idempotencyKey: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Client-supplied idempotency key. The Brighty API requires one — a UUIDv4 is generated when omitted. Reuse the same key on retries to avoid duplicate transfers.",
    ),
});

export type CreateInternalTransferArgs = z.infer<typeof createInternalTransferInputSchema>;

export async function runCreateInternalTransfer(
  client: BrightyClient,
  args: CreateInternalTransferArgs,
): Promise<{ transfer: TransferPostponedResponse; idempotencyKey: string }> {
  const source = await client.get<Account>(`/accounts/${encodeURIComponent(args.sourceAccountId)}`);
  if (source.balance.currency !== args.amount.currency) {
    throw new Error(
      `Internal transfer currency mismatch: source account ${args.sourceAccountId} is ${source.balance.currency}, transfer amount is ${args.amount.currency}. Use brighty_transfer_intent for FX.`,
    );
  }

  const idempotencyKey = args.idempotencyKey ?? randomUUID();
  const body: Record<string, unknown> = {
    sourceAccountId: args.sourceAccountId,
    amount: args.amount,
    receiverUsername: args.receiverUsername,
  };
  if (args.comment !== undefined) {
    body.comment = args.comment;
  }

  const transfer = await client.post<TransferPostponedResponse>(
    `/payouts/${encodeURIComponent(args.payoutId)}/transfers/internal`,
    { body, idempotencyKey },
  );

  return { transfer, idempotencyKey };
}

export const createInternalTransfer = defineBrightyTool({
  name: "brighty_create_internal_transfer",
  description:
    "Add an internal transfer (Brighty-to-Brighty) to a payout. Recipient is identified by `receiverUsername` (the @-tag on the recipient's Brighty profile). The source account's currency must match the transfer amount currency; for FX between own accounts use brighty_transfer_intent + brighty_transfer_own. Idempotency-Key is required by the API and auto-generated as UUIDv4 when not supplied. Returns { transfer: { id, createdAt }, idempotencyKey }.",
  inputSchema: createInternalTransferInputSchema,
  execute: runCreateInternalTransfer,
});
