import { z } from "zod";

import type { Member } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const invitationSchema = z.object({
  email: z.string().email().describe("Email address that will receive the Brighty invitation."),
  role: z
    .enum(["OWNER", "ADMIN", "ACCOUNTANT", "EMPLOYEE"])
    .describe("Role granted to the member after they accept the invitation."),
  name: z.string().min(1).max(120).optional().describe("Optional display name for the invitee."),
});

const inputSchema = z.object({
  invitations: z.array(invitationSchema).min(1).describe("One or more invitations to send."),
});

export const addMembers = defineBrightyTool({
  name: "brighty_add_members",
  description:
    "Invite one or more teammates to the authenticated Brighty business. Each invitation specifies the recipient's email and the role to grant on acceptance.",
  inputSchema,
  execute: async (client, args) =>
    client.post<Member[]>("/members", {
      body: { invitations: args.invitations },
    }),
});
