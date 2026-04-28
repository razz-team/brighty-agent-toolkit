import type { BrightyTool } from "../tool.js";

import { createExternalTransfer } from "./create-external-transfer.js";
import { createInternalTransfer } from "./create-internal-transfer.js";
import { createPayout } from "./create-payout.js";
import { getPayout } from "./get-payout.js";
import { listPayouts } from "./list-payouts.js";
import { startPayout } from "./start-payout.js";

export {
  createExternalTransfer,
  createInternalTransfer,
  createPayout,
  getPayout,
  listPayouts,
  startPayout,
};

export const payoutsTools: BrightyTool[] = [
  listPayouts,
  createPayout,
  getPayout,
  createInternalTransfer,
  createExternalTransfer,
  startPayout,
];
