import { z } from "zod";

import type { BrightyClient } from "../../api/client.js";
import type {
  Account,
  GetPayoutResponse,
  Money,
  PayoutTransferDetailed,
} from "../../types/brighty.js";
import { asTextResult, defineBrightyTool } from "../tool.js";

// Fixed scale large enough to cover both fiat (2 dp) and crypto (≤18 dp) amounts.
const PREFLIGHT_SCALE = 18;
const TEN = 10n;

function toScaled(value: string, scale = PREFLIGHT_SCALE): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", frac = ""] = unsigned.split(".");
  const truncatedFrac = frac.slice(0, scale);
  const padded = truncatedFrac + "0".repeat(scale - truncatedFrac.length);
  const combined = (whole + padded).replace(/^0+(?=\d)/, "");
  const big = BigInt(combined.length === 0 ? "0" : combined);
  return negative ? -big : big;
}

function fromScaled(value: bigint, scale = PREFLIGHT_SCALE): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const divisor = TEN ** BigInt(scale);
  const whole = abs / divisor;
  const frac = abs % divisor;
  const fracStr = frac.toString().padStart(scale, "0").replace(/0+$/, "");
  const out = fracStr.length === 0 ? `${whole}` : `${whole}.${fracStr}`;
  return negative ? `-${out}` : out;
}

export interface PreflightShortfall {
  accountId: string;
  currency: string;
  required: Money;
  available: Money;
  shortfall: Money;
}

export interface PreflightOk {
  ok: true;
  perAccount: Array<{
    accountId: string;
    currency: string;
    required: Money;
    available: Money;
  }>;
}

export interface PreflightFailed {
  ok: false;
  shortfalls: PreflightShortfall[];
}

export type PreflightResult = PreflightOk | PreflightFailed;

interface AccountAggregate {
  currency: string;
  scaled: bigint;
}

export async function runPreflightBalanceCheck(
  client: BrightyClient,
  payoutResponse: GetPayoutResponse,
): Promise<PreflightResult> {
  const transfers = payoutResponse.transfers ?? [];
  const required = new Map<string, AccountAggregate>();

  for (const transfer of transfers as PayoutTransferDetailed[]) {
    const accId = transfer.sourceAccountId;
    if (!accId || !transfer.amount) continue;
    const cur = required.get(accId);
    const amountScaled = toScaled(transfer.amount.amount);
    if (cur) {
      if (cur.currency !== transfer.amount.currency) {
        throw new Error(
          `Payout has mixed currencies on source account ${accId}: ${cur.currency} vs ${transfer.amount.currency}.`,
        );
      }
      cur.scaled += amountScaled;
    } else {
      required.set(accId, {
        currency: transfer.amount.currency,
        scaled: amountScaled,
      });
    }
  }

  const perAccount: PreflightOk["perAccount"] = [];
  const shortfalls: PreflightShortfall[] = [];

  for (const [accountId, agg] of required) {
    const account = await client.get<Account>(`/accounts/${encodeURIComponent(accountId)}`);
    const balance = account.balance;
    if (balance.currency !== agg.currency) {
      throw new Error(
        `Account ${accountId} currency (${balance.currency}) does not match transfer currency (${agg.currency}).`,
      );
    }
    const availableScaled = toScaled(balance.amount);
    const requiredMoney: Money = {
      amount: fromScaled(agg.scaled),
      currency: agg.currency,
    };
    const availableMoney: Money = {
      amount: balance.amount,
      currency: balance.currency,
    };
    if (availableScaled < agg.scaled) {
      shortfalls.push({
        accountId,
        currency: agg.currency,
        required: requiredMoney,
        available: availableMoney,
        shortfall: {
          amount: fromScaled(agg.scaled - availableScaled),
          currency: agg.currency,
        },
      });
    } else {
      perAccount.push({
        accountId,
        currency: agg.currency,
        required: requiredMoney,
        available: availableMoney,
      });
    }
  }

  if (shortfalls.length > 0) {
    return { ok: false, shortfalls };
  }
  return { ok: true, perAccount };
}

export interface StartPayoutBlocked {
  ok: false;
  error: "PreflightFailed";
  message: string;
  shortfalls: PreflightShortfall[];
}

export type StartPayoutResult = { ok: true } | StartPayoutBlocked;

const inputSchema = z.object({
  payoutId: z
    .string()
    .min(1)
    .describe("Brighty payout id to start. Must currently be in CREATED state."),
  createdAt: z
    .string()
    .min(1)
    .describe(
      "Payout's createdAt timestamp (ISO Instant). Required by the Brighty API; pass the value returned from brighty_create_payout / brighty_list_payouts.",
    ),
  skipPreflight: z
    .boolean()
    .optional()
    .describe(
      "DANGEROUS: skip the local source-account balance preflight. Default false. Only set true when the user has explicitly accepted the risk of partial failure.",
    ),
});

export const startPayout = defineBrightyTool<typeof inputSchema.shape, StartPayoutResult>({
  name: "brighty_start_payout",
  description:
    "Commit a payout — Brighty starts processing every attached transfer. Before calling the API, this tool runs a local preflight balance check: fetch the payout's transfers, sum amounts per source account, fetch each source account's balance, and abort if any account is short. Set skipPreflight=true only when the user has explicitly accepted partial-failure risk. Returns { ok: true } on success (the API returns 204 No Content).",
  inputSchema,
  execute: async (client, args) => {
    if (!args.skipPreflight) {
      const payoutResponse = await client.get<GetPayoutResponse>(
        `/payouts/${encodeURIComponent(args.payoutId)}`,
        { query: { createdAt: args.createdAt } },
      );
      const preflight = await runPreflightBalanceCheck(client, payoutResponse);
      if (!preflight.ok) {
        return {
          ok: false,
          error: "PreflightFailed",
          message: `Insufficient balance to start payout (${preflight.shortfalls.length} account(s) short).`,
          shortfalls: preflight.shortfalls,
        };
      }
    }

    await client.post<void>(`/payouts/${encodeURIComponent(args.payoutId)}/start`, {
      query: { createdAt: args.createdAt },
    });
    return { ok: true };
  },
  // Render a blocked preflight as an MCP error result so the agent sees the
  // structured per-account shortfall list (the SDK only forwards `error.message`
  // when a handler throws, which would drop `shortfalls`).
  formatResult: (result) => {
    if ("ok" in result && result.ok === false) {
      return { ...asTextResult(result), isError: true };
    }
    return asTextResult(result);
  },
});
