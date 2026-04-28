import { z } from "zod";

import type { BrightyClient } from "../../api/client.js";
import type { TransferIntent } from "../../types/brighty.js";
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

// .strict() rejects unknown keys at parse time. transferOwn reuses this
// schema, and accepting a caller-supplied `idempotencyKey` there would be
// unsafe: each call refetches the intent (fresh hash), so the body changes
// per attempt and a "retry" is actually a new transfer. Strict mode makes
// that contract enforceable instead of silently dropping the key.
export const transferIntentInputSchema = z
  .object({
    sourceAccountId: z.string().min(1).describe("Brighty account id the funds come from."),
    destinationAccountId: z
      .string()
      .min(1)
      .describe(
        "Brighty account id the funds go to. Must belong to the same business as sourceAccountId.",
      ),
    amount: moneySchema.describe("Amount and currency to convert."),
    amountSide: z
      .enum(["SOURCE", "DESTINATION"])
      .default("SOURCE")
      .describe(
        "Which side of the transfer the amount applies to. SOURCE means 'send exactly this from the source account'; DESTINATION means 'receive exactly this on the destination account'.",
      ),
  })
  .strict();

export type TransferIntentArgs = z.infer<typeof transferIntentInputSchema>;

export async function runTransferIntent(
  client: BrightyClient,
  args: TransferIntentArgs,
): Promise<TransferIntent> {
  return client.post<TransferIntent>("/transfers/intent", {
    body: {
      sourceAccountId: args.sourceAccountId,
      destinationAccountId: args.destinationAccountId,
      amount: args.amount,
      amountSide: args.amountSide,
    },
  });
}

export const transferIntent = defineBrightyTool({
  name: "brighty_transfer_intent",
  description:
    "Preview a transfer between two own Brighty accounts. Returns the live FX rate, fees, resolved fromAmount/toAmount, and a short-lived hash. Forward the hash to brighty_transfer_own to execute. Always call this first so the user can confirm the rate before commitment.",
  inputSchema: transferIntentInputSchema,
  execute: runTransferIntent,
});
