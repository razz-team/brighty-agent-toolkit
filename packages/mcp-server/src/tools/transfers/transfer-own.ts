import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { BrightyClient } from "../../api/client.js";
import type { OwnTransferCreated, OwnTransferIntent } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";
import { runTransferIntent, transferIntentInputSchema } from "./transfer-intent.js";

// transferOwnInputSchema extends transferIntentInputSchema with the destination
// account so the executor can both refresh the intent and target the right
// account. The intent itself does not take a target account — it is a pure
// rate quote.
export const transferOwnInputSchema = transferIntentInputSchema.extend({
  targetAccountId: z
    .string()
    .min(1)
    .describe("Brighty account id the funds will land in. Must belong to the same business."),
});

export type TransferOwnArgs = z.infer<typeof transferOwnInputSchema>;

export interface OwnTransferResult {
  intent: OwnTransferIntent;
  transfer: OwnTransferCreated;
  idempotencyKey: string;
}

export async function runTransferOwn(
  client: BrightyClient,
  args: TransferOwnArgs,
): Promise<OwnTransferResult> {
  // The idempotency key is generated per invocation, not accepted from the
  // caller: a fresh intent (with a fresh hash) is fetched each call, so the
  // /transfers/own body changes between retries — reusing a key with a
  // different body would either fail the API's body-binding check or, worse,
  // commit a transfer at a rate the user never approved.
  const intent = await runTransferIntent(client, args);
  const idempotencyKey = randomUUID();
  const transfer = await client.post<OwnTransferCreated>("/transfers/own", {
    body: {
      sourceAccountId: args.sourceAccountId,
      targetAccountId: args.targetAccountId,
      quote: intent.quote,
      hash: intent.hash,
      fees: intent.fees,
    },
    idempotencyKey,
  });
  return { intent, transfer, idempotencyKey };
}

export const transferOwn = defineBrightyTool({
  name: "brighty_transfer_own",
  description:
    "Execute an FX transfer between two of the business's own Brighty accounts. Internally re-fetches the intent (so the rate is current) then POSTs /transfers/own with { sourceAccountId, targetAccountId, quote, hash, fees } and a generated UUIDv4 Idempotency-Key. Returns the intent (rate/fees/delivery) alongside the resulting transaction { transactionId, transactionState, createdAt }.",
  inputSchema: transferOwnInputSchema,
  execute: runTransferOwn,
});
