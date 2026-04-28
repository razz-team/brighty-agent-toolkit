import { randomUUID } from "node:crypto";
import type { z } from "zod";

import type { BrightyClient } from "../../api/client.js";
import type { OwnTransfer, TransferIntent } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";
import { runTransferIntent, transferIntentInputSchema } from "./transfer-intent.js";

export const transferOwnInputSchema = transferIntentInputSchema;

export type TransferOwnArgs = z.infer<typeof transferOwnInputSchema>;

export interface OwnTransferResult {
  intent: TransferIntent;
  transfer: OwnTransfer;
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
  const transfer = await client.post<OwnTransfer>("/transfers/own", {
    body: { hash: intent.hash },
    idempotencyKey,
  });
  return { intent, transfer, idempotencyKey };
}

export const transferOwn = defineBrightyTool({
  name: "brighty_transfer_own",
  description:
    "Execute a transfer between two of the business's own Brighty accounts. Always fetches a fresh transfer intent first to keep the rate current, then forwards the intent hash to /transfers/own with a unique idempotency key. Returns the intent (rate/fees) alongside the resulting transfer.",
  inputSchema: transferOwnInputSchema,
  execute: runTransferOwn,
});
