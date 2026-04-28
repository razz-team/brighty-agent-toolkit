import type { BrightyTool } from "../tool.js";

import { addMembers } from "./add-members.js";
import { listMembers } from "./list-members.js";
import { removeMembers } from "./remove-members.js";

export { addMembers, listMembers, removeMembers };

export const membersTools: BrightyTool[] = [listMembers, addMembers, removeMembers];
