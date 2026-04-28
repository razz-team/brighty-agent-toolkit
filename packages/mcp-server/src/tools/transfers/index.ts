import type { BrightyTool } from "../tool.js";

import { transferIntent } from "./transfer-intent.js";
import { transferOwn } from "./transfer-own.js";

export { transferIntent, transferOwn };

export const transfersTools: BrightyTool[] = [transferIntent, transferOwn];
