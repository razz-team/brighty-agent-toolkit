import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { BrightyClient } from "../../api/client.js";
import type { TransferPostponedResponse } from "../../types/brighty.js";
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

const fiatBeneficiarySchema = z.object({
  kind: z.literal("FIAT").describe("Use FIAT for SEPA/SWIFT/ACH and similar bank rails."),
  beneficiaryName: z
    .string()
    .min(1)
    .max(140)
    .describe("Full legal name of the recipient (person or business)."),
  iban: z
    .string()
    .min(8)
    .max(34)
    .optional()
    .describe("Recipient IBAN. Required for SEPA; optional for SWIFT."),
  accountNumber: z
    .string()
    .min(1)
    .optional()
    .describe("Local account number when IBAN is not used (e.g. ACH routing destinations)."),
  bic: z.string().min(8).max(11).optional().describe("Recipient bank BIC/SWIFT (8 or 11 chars)."),
  swiftCode: z
    .string()
    .min(8)
    .max(11)
    .optional()
    .describe("SWIFT code; alias for bic in some payment rails."),
  routingNumber: z.string().min(1).optional().describe("US ABA routing number for ACH/Fedwire."),
  bankName: z.string().min(1).optional().describe("Recipient bank name."),
  beneficiaryAddress: z
    .string()
    .min(1)
    .optional()
    .describe("Postal address of the beneficiary; required for some rails."),
  isBusinessRecipient: z
    .boolean()
    .optional()
    .describe(
      "Set true when the recipient is a business, false for individuals. Defaults to the API's policy when omitted.",
    ),
});

const cryptoBeneficiarySchema = z.object({
  kind: z.literal("CRYPTO").describe("Use CRYPTO for on-chain destinations."),
  beneficiaryName: z
    .string()
    .min(1)
    .max(140)
    .optional()
    .describe("Display name for the recipient. Recommended for AML records."),
  accountNumber: z
    .string()
    .min(1)
    .describe("On-chain destination address (e.g. BTC address, ETH 0x address, TRX address)."),
  transferNetworkId: z
    .string()
    .min(2)
    .max(32)
    .describe(
      "Network identifier, e.g. BTC, ETH, TRX. Must match the asset of the source account.",
    ),
  memo: z
    .string()
    .min(1)
    .optional()
    .describe("Memo / destination tag for chains that require one (e.g. XRP, XLM)."),
  isBusinessRecipient: z
    .boolean()
    .optional()
    .describe("Whether the recipient is a business; defaults to API policy."),
});

const beneficiarySchema = z.discriminatedUnion("kind", [
  fiatBeneficiarySchema,
  cryptoBeneficiarySchema,
]);

export const createExternalTransferInputSchema = z.object({
  payoutId: z
    .string()
    .min(1)
    .describe("Brighty payout id (in CREATED state) the transfer will be added to."),
  payoutCreatedAt: z
    .string()
    .min(1)
    .describe(
      "The payout's createdAt timestamp (ISO Instant). Required by the Brighty API as a query param alongside the path id; pass the value returned from brighty_create_payout.",
    ),
  sourceAccountId: z.string().min(1).describe("Brighty account id the funds come from."),
  amount: moneySchema.describe("Amount and currency to send."),
  beneficiary: beneficiarySchema
    .optional()
    .describe(
      "Inline recipient details. Use kind='FIAT' for IBAN/BIC/account-number bank transfers; kind='CRYPTO' for on-chain transfers with accountNumber + transferNetworkId. Provide either `beneficiary` (inline) or `beneficiaryId` (saved beneficiary).",
    ),
  beneficiaryId: z
    .string()
    .min(1)
    .optional()
    .describe("Saved beneficiary id (UUID). Provide either `beneficiary` (inline) or this."),
  reference: z
    .string()
    .min(1)
    .max(140)
    .optional()
    .describe("Payment reference / memo line shown on the recipient's statement."),
  evidence: z
    .array(z.string().min(1))
    .optional()
    .describe("Optional supporting document URIs (e.g. invoice attachments)."),
  idempotencyKey: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Client-supplied idempotency key. The Brighty API requires one — a UUIDv4 is generated when omitted. Reuse the same key on retries to avoid duplicate transfers.",
    ),
});

export type CreateExternalTransferArgs = z.infer<typeof createExternalTransferInputSchema>;

export async function runCreateExternalTransfer(
  client: BrightyClient,
  args: CreateExternalTransferArgs,
): Promise<{ transfer: TransferPostponedResponse; idempotencyKey: string }> {
  if (args.beneficiary === undefined && args.beneficiaryId === undefined) {
    throw new Error(
      "brighty_create_external_transfer requires either an inline `beneficiary` or a `beneficiaryId`. Provide one of them.",
    );
  }
  if (
    args.beneficiary?.kind === "FIAT" &&
    !args.beneficiary.iban &&
    !args.beneficiary.accountNumber
  ) {
    throw new Error(
      "FIAT beneficiary requires at least one of `iban` or `accountNumber` so the transfer has a destination. " +
        "Add the recipient's IBAN (SEPA/SWIFT) or local account number (ACH/wire) before retrying.",
    );
  }
  const idempotencyKey = args.idempotencyKey ?? randomUUID();
  const body: Record<string, unknown> = {
    sourceAccountId: args.sourceAccountId,
    amount: args.amount,
  };
  if (args.beneficiary !== undefined) {
    body.beneficiary = args.beneficiary;
  }
  if (args.beneficiaryId !== undefined) {
    body.beneficiaryId = args.beneficiaryId;
  }
  if (args.reference !== undefined) {
    body.reference = args.reference;
  }
  if (args.evidence !== undefined) {
    body.evidence = args.evidence;
  }
  const transfer = await client.post<TransferPostponedResponse>(
    `/payouts/${encodeURIComponent(args.payoutId)}/transfers/external`,
    { body, idempotencyKey, query: { createdAt: args.payoutCreatedAt } },
  );
  return { transfer, idempotencyKey };
}

export const createExternalTransfer = defineBrightyTool({
  name: "brighty_create_external_transfer",
  description:
    "Add an external transfer (off-Brighty) to a payout. Discriminates between fiat (IBAN/BIC/account-number) and crypto (on-chain address + network id) recipients via the beneficiary.kind field, or pass a saved `beneficiaryId` instead of an inline beneficiary. The Brighty API requires `createdAt` (the payout's timestamp) as a query param and `Idempotency-Key` as a header — both are wired through. Returns { transfer: { id, createdAt }, idempotencyKey }.",
  inputSchema: createExternalTransferInputSchema,
  execute: runCreateExternalTransfer,
});
