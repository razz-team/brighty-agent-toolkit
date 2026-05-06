import { z } from "zod";

import type { AddMembersResponse } from "../../types/brighty.js";
import { defineBrightyTool } from "../tool.js";

const memberDataSchema = z.object({
  email: z.email().describe("Email address that will receive the Brighty invitation."),
  role: z
    .enum(["MEMBER", "VIEWER", "PAYER", "ADMIN", "OWNER"])
    .describe(
      "Role granted on acceptance. MEMBER = baseline access; VIEWER = read-only; PAYER = can move money; ADMIN = team + settings; OWNER = full control.",
    ),
  legalName: z
    .object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
    })
    .optional()
    .describe("Optional legal name for KYC pre-fill."),
  birthInfo: z
    .object({
      date: z.string().min(1).optional().describe("ISO date of birth, e.g. 1990-01-31."),
      placeOfBirth: z.string().min(1).optional(),
    })
    .optional()
    .describe("Optional birth information for KYC pre-fill."),
  nationality: z
    .string()
    .min(2)
    .max(3)
    .optional()
    .describe("ISO country code (2 or 3 letters) for nationality."),
});

const inputSchema = z.object({
  members: z.array(memberDataSchema).min(1).describe("One or more members to invite."),
});

export const addMembers = defineBrightyTool({
  name: "brighty_add_members",
  description:
    "Invite one or more teammates to the authenticated Brighty business. Each entry needs email and role; legalName / birthInfo / nationality are optional KYC pre-fills. Returns an array of Membership { memberId, role, state }.",
  inputSchema,
  execute: async (client, args) =>
    client.post<AddMembersResponse>("/members", {
      body: { members: args.members },
    }),
});
