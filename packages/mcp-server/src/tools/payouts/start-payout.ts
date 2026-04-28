import { z } from "zod";

import type { BrightyClient } from "../../api/client.js";
import type { Account, Money, Payout, PayoutTransfer } from "../../types/brighty.js";
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
  payout: Payout,
): Promise<PreflightResult> {
  const transfers = payout.transfers ?? [];
  const required = new Map<string, AccountAggregate>();

  for (const transfer of transfers as PayoutTransfer[]) {
    const accId = transfer.sourceAccountId;
    if (!accId) continue;
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
    const availableSource = account.availableBalance ?? account.balance;
    if (availableSource.currency !== agg.currency) {
      throw new Error(
        `Account ${accountId} currency (${availableSource.currency}) does not match transfer currency (${agg.currency}).`,
      );
    }
    const availableScaled = toScaled(availableSource.amount);
    const requiredMoney: Money = {
      amount: fromScaled(agg.scaled),
      currency: agg.currency,
    };
    const availableMoney: Money = {
      amount: availableSource.amount,
      currency: availableSource.currency,
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

export type StartPayoutResult = Payout | StartPayoutBlocked;

const inputSchema = z.object({
  payoutId: z.string().min(1).describe("Brighty payout id to start. Must currently be in DRAFT."),
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
    "Commit a DRAFT payout — Brighty starts processing every attached transfer. Before calling the API, this tool runs a local preflight balance check: fetch the payout's transfers, sum amounts per source account, fetch each source account's available balance, and abort if any account is short. Set skipPreflight=true only when the user has explicitly accepted partial-failure risk.",
  inputSchema,
  execute: async (client, args) => {
    const payout = await client.get<Payout>(`/payouts/${encodeURIComponent(args.payoutId)}`);

    if (!args.skipPreflight) {
      const preflight = await runPreflightBalanceCheck(client, payout);
      if (!preflight.ok) {
        return {
          ok: false,
          error: "PreflightFailed",
          message: `Insufficient balance to start payout (${preflight.shortfalls.length} account(s) short).`,
          shortfalls: preflight.shortfalls,
        };
      }
    }

    const started = await client.post<Payout>(
      `/payouts/${encodeURIComponent(args.payoutId)}/start`,
    );
    return started;
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
