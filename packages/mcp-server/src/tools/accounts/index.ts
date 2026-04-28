import type { BrightyTool } from "../tool.js";

import { createAccount } from "./create-account.js";
import { getAccount } from "./get-account.js";
import { getAccountAddresses } from "./get-account-addresses.js";
import { listAccounts } from "./list-accounts.js";
import { terminateAccount } from "./terminate-account.js";

export { createAccount, getAccount, getAccountAddresses, listAccounts, terminateAccount };

export const accountsTools: BrightyTool[] = [
  listAccounts,
  getAccount,
  createAccount,
  terminateAccount,
  getAccountAddresses,
];
