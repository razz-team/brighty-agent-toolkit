import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { BrightyClient } from "../../api/client.js";
import type { Account, PayoutTransfer } from "../../types/brighty.js";
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

// NOTE: Top-level schema MUST be a plain z.object so registerAllTools can
// access `tool.inputSchema.shape`. Mutual-exclusion of recipientAccountId vs
// recipientTag is enforced at runtime in execute() instead of via .refine().
export const createInternalTransferInputSchema = z.object({
  payoutId: z
    .string()
    .min(1)
    .describe("Brighty payout id (in DRAFT) the transfer will be added to."),
  sourceAccountId: z.string().min(1).describe("Brighty account id the funds come from."),
  amount: moneySchema.describe(
    "Amount and currency to send. Currency must match the source account's currency; this tool does not perform FX.",
  ),
  recipientAccountId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Destination Brighty account id. Provide exactly one of recipientAccountId or recipientTag.",
    ),
  recipientTag: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Recipient's Brighty tag (e.g. '@alice'). Provide exactly one of recipientAccountId or recipientTag.",
    ),
  reference: z
    .string()
    .min(1)
    .max(140)
    .optional()
    .describe("Optional payment reference shown on both sides."),
  idempotencyKey: z
    .string()
    .min(1)
    .optional()
    .describe("Optional client-supplied idempotency key. A UUIDv4 is generated when omitted."),
});

export type CreateInternalTransferArgs = z.infer<typeof createInternalTransferInputSchema>;

export async function runCreateInternalTransfer(
  client: BrightyClient,
  args: CreateInternalTransferArgs,
): Promise<{ transfer: PayoutTransfer; idempotencyKey: string }> {
  const hasAccount = args.recipientAccountId !== undefined;
  const hasTag = args.recipientTag !== undefined;
  if (hasAccount === hasTag) {
    throw new Error("Provide exactly one of recipientAccountId or recipientTag.");
  }

  const source = await client.get<Account>(`/accounts/${encodeURIComponent(args.sourceAccountId)}`);
  if (source.currency !== args.amount.currency) {
    throw new Error(
      `Internal transfer currency mismatch: source account ${args.sourceAccountId} is ${source.currency}, transfer amount is ${args.amount.currency}. Use brighty_transfer_intent for FX.`,
    );
  }

  const idempotencyKey = args.idempotencyKey ?? randomUUID();
  const body: Record<string, unknown> = {
    sourceAccountId: args.sourceAccountId,
    amount: args.amount,
  };
  if (args.recipientAccountId !== undefined) {
    body.recipientAccountId = args.recipientAccountId;
  }
  if (args.recipientTag !== undefined) {
    body.recipientTag = args.recipientTag;
  }
  if (args.reference !== undefined) {
    body.reference = args.reference;
  }

  const transfer = await client.post<PayoutTransfer>(
    `/payouts/${encodeURIComponent(args.payoutId)}/transfers/internal`,
    { body, idempotencyKey },
  );

  return { transfer, idempotencyKey };
}

export const createInternalTransfer = defineBrightyTool({
  name: "brighty_create_internal_transfer",
  description:
    "Add an internal transfer (Brighty-to-Brighty within the same business or to another Brighty user via @tag) to a DRAFT payout. The source account's currency must match the transfer amount currency; for FX between own accounts use brighty_transfer_intent + brighty_transfer_own instead. Provide exactly one of recipientAccountId or recipientTag. Generates a UUIDv4 idempotency key when one is not supplied.",
  inputSchema: createInternalTransferInputSchema,
  execute: runCreateInternalTransfer,
});
