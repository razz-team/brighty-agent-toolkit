import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { checkToolReferences, main } from "../../../scripts/check-tool-references.mjs";

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "check-tools-"));
  const skillsDir = path.join(root, "skills");
  const toolsDir = path.join(root, "tools");
  await mkdir(skillsDir, { recursive: true });
  await mkdir(toolsDir, { recursive: true });
  return { root, skillsDir, toolsDir };
}

async function writeSkill(skillsDir, skillName, body) {
  const dir = path.join(skillsDir, skillName);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), body, "utf8");
}

async function writeTool(toolsDir, relPath, body) {
  const full = path.join(toolsDir, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body, "utf8");
}

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) {
    const dir = cleanups.pop();
    await rm(dir, { recursive: true, force: true });
  }
});

describe("checkToolReferences", () => {
  it("positive: every skill reference resolves to a registered tool", async () => {
    const { root, skillsDir, toolsDir } = await makeFixture();
    cleanups.push(root);

    await writeSkill(
      skillsDir,
      "brighty-banking",
      "Use `brighty_list_accounts` then `brighty_get_account`.",
    );
    await writeSkill(skillsDir, "brighty-cards", "Call `brighty_list_cards` to enumerate.");
    await writeTool(
      toolsDir,
      "accounts/list-accounts.ts",
      `export const listAccounts = defineBrightyTool({\n  name: "brighty_list_accounts",\n});\n`,
    );
    await writeTool(
      toolsDir,
      "accounts/get-account.ts",
      `defineBrightyTool({ name: "brighty_get_account" });\n`,
    );
    await writeTool(
      toolsDir,
      "cards/list-cards.ts",
      `defineBrightyTool({\n  name: 'brighty_list_cards',\n});\n`,
    );

    const result = await checkToolReferences({ skillsDir, toolsDir });

    expect(result.missing).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.codeTools.size).toBe(3);
    expect([...result.skillTools.keys()].toSorted()).toEqual([
      "brighty_get_account",
      "brighty_list_accounts",
      "brighty_list_cards",
    ]);
    expect(result.skillTools.get("brighty_list_cards")).toEqual(["brighty-cards"]);
  });

  it("negative: skill references a tool that does not exist in code", async () => {
    const { root, skillsDir, toolsDir } = await makeFixture();
    cleanups.push(root);

    await writeSkill(
      skillsDir,
      "brighty-banking",
      "Use `brighty_list_accounts` and the now-removed `brighty_setup`.",
    );
    await writeTool(
      toolsDir,
      "accounts/list-accounts.ts",
      `defineBrightyTool({ name: "brighty_list_accounts" });\n`,
    );

    const result = await checkToolReferences({ skillsDir, toolsDir });

    expect(result.missing).toEqual([{ tool: "brighty_setup", skills: ["brighty-banking"] }]);
    expect(result.orphans).toEqual([]);
  });

  it("orphan: tool exists in code but is not mentioned by any skill (warning)", async () => {
    const { root, skillsDir, toolsDir } = await makeFixture();
    cleanups.push(root);

    await writeSkill(skillsDir, "brighty-banking", "Use `brighty_list_accounts`.");
    await writeTool(
      toolsDir,
      "accounts/list-accounts.ts",
      `defineBrightyTool({ name: "brighty_list_accounts" });\n`,
    );
    await writeTool(
      toolsDir,
      "internal/secret-tool.ts",
      `defineBrightyTool({ name: "brighty_internal_secret" });\n`,
    );

    const result = await checkToolReferences({ skillsDir, toolsDir });

    expect(result.missing).toEqual([]);
    expect(result.orphans).toEqual(["brighty_internal_secret"]);
  });

  it("ignores non-ts files and missing dirs", async () => {
    const { root, skillsDir } = await makeFixture();
    cleanups.push(root);

    // toolsDir intentionally not created
    await writeSkill(skillsDir, "brighty-banking", "Use `brighty_list_accounts`.");

    const result = await checkToolReferences({
      skillsDir,
      toolsDir: path.join(root, "does-not-exist"),
    });

    expect(result.codeTools.size).toBe(0);
    expect(result.missing).toEqual([
      { tool: "brighty_list_accounts", skills: ["brighty-banking"] },
    ]);
  });

  it("description-only mentions inside tool files do not count as registrations", async () => {
    const { root, skillsDir, toolsDir } = await makeFixture();
    cleanups.push(root);

    await writeSkill(
      skillsDir,
      "brighty-payouts",
      "Call `brighty_create_payout` then `brighty_start_payout`.",
    );
    await writeTool(
      toolsDir,
      "payouts/create-payout.ts",
      `defineBrightyTool({\n  name: "brighty_create_payout",\n  description: "After this, call brighty_start_payout to commit.",\n});\n`,
    );
    // brighty_start_payout is mentioned in a description but never declared.

    const result = await checkToolReferences({ skillsDir, toolsDir });

    expect(result.codeTools.has("brighty_start_payout")).toBe(false);
    expect(result.missing).toEqual([{ tool: "brighty_start_payout", skills: ["brighty-payouts"] }]);
  });
});

describe("main()", () => {
  it("returns 0 and logs ok summary when invariant holds against repo", async () => {
    const logs = [];
    const warnings = [];
    const errors = [];
    const code = await main({
      log: (msg) => logs.push(msg),
      warn: (msg) => warnings.push(msg),
      error: (msg) => errors.push(msg),
    });
    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(logs.some((m) => m.startsWith("[check-tools] ok"))).toBe(true);
  });
});
