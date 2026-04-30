import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { validatePlugin, main } from "../../../scripts/validate-plugin.mjs";

async function makeRepo() {
  const root = await mkdtemp(path.join(tmpdir(), "validate-plugin-"));
  await mkdir(path.join(root, ".claude-plugin"), { recursive: true });
  return root;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function writeSkill(repoRoot, skillName) {
  const dir = path.join(repoRoot, "skills", skillName);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "SKILL.md"),
    `---\nname: ${skillName}\ndescription: Test skill.\n---\n\nbody\n`,
    "utf8",
  );
}

async function writeFileAt(repoRoot, rel, body = "stub\n") {
  const full = path.join(repoRoot, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body, "utf8");
}

const validMcpJson = {
  mcpServers: {
    brighty: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@brighty-app/mcp-server"],
    },
  },
};

async function writeBaselineRepo({ withAgents = false, withCommands = false } = {}) {
  const root = await makeRepo();
  await writeSkill(root, "brighty-banking");
  await writeSkill(root, "brighty-cards");

  const pluginManifest = {
    name: "brighty",
    version: "0.1.0",
    description: "Test plugin.",
    skills: ["skills/brighty-banking", "skills/brighty-cards"],
    mcpServers: ".mcp.json",
  };
  if (withAgents) {
    pluginManifest.agents = ["agents/bookkeeper.md"];
    await writeFileAt(root, "agents/bookkeeper.md", "# Bookkeeper\n");
  }
  if (withCommands) {
    pluginManifest.commands = ["commands/pay-invoice.md"];
    await writeFileAt(root, "commands/pay-invoice.md", "# Pay invoice\n");
  }

  await writeJson(path.join(root, ".claude-plugin", "plugin.json"), pluginManifest);
  await writeJson(path.join(root, ".claude-plugin", "marketplace.json"), {
    name: "brighty-agent-toolkit",
    owner: "razz-team",
    plugins: [
      {
        name: "brighty",
        source: "./",
        category: "fintech",
        description: "Test.",
      },
    ],
  });
  await writeJson(path.join(root, ".mcp.json"), validMcpJson);
  return root;
}

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) {
    const dir = cleanups.pop();
    await rm(dir, { recursive: true, force: true });
  }
});

describe("validatePlugin", () => {
  it("positive: clean fixture passes with no errors or warnings", async () => {
    const repoRoot = await writeBaselineRepo();
    cleanups.push(repoRoot);

    const result = await validatePlugin({ repoRoot });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.plugin?.name).toBe("brighty");
  });

  it("positive: agents and commands paths that exist pass", async () => {
    const repoRoot = await writeBaselineRepo({ withAgents: true, withCommands: true });
    cleanups.push(repoRoot);

    const result = await validatePlugin({ repoRoot });

    expect(result.errors).toEqual([]);
  });

  it("fails when marketplace plugin name does not match plugin.json name", async () => {
    const repoRoot = await writeBaselineRepo();
    cleanups.push(repoRoot);
    const marketplacePath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
    await writeJson(marketplacePath, {
      name: "brighty-agent-toolkit",
      owner: "razz-team",
      plugins: [{ name: "brighty-renamed", source: "./", description: "x" }],
    });

    const result = await validatePlugin({ repoRoot });

    expect(result.errors.some((e) => e.includes("name mismatch"))).toBe(true);
  });

  it("only checks name match against local-source plugins (warns when none)", async () => {
    const repoRoot = await writeBaselineRepo();
    cleanups.push(repoRoot);
    const marketplacePath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
    await writeJson(marketplacePath, {
      name: "brighty-agent-toolkit",
      owner: "razz-team",
      plugins: [
        { name: "external-plugin", source: "https://example.com/plugin", description: "x" },
      ],
    });

    const result = await validatePlugin({ repoRoot });

    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("does not list any local plugin"))).toBe(true);
  });

  it("fails when a declared skill path does not exist", async () => {
    const repoRoot = await writeBaselineRepo();
    cleanups.push(repoRoot);
    const pluginPath = path.join(repoRoot, ".claude-plugin", "plugin.json");
    await writeJson(pluginPath, {
      name: "brighty",
      skills: ["skills/brighty-banking", "skills/brighty-missing"],
      mcpServers: ".mcp.json",
    });

    const result = await validatePlugin({ repoRoot });

    expect(
      result.errors.some((e) =>
        e.includes("plugin.skills entry not a directory: skills/brighty-missing"),
      ),
    ).toBe(true);
  });

  it("fails when a declared skill directory has no SKILL.md", async () => {
    const repoRoot = await writeBaselineRepo();
    cleanups.push(repoRoot);
    await mkdir(path.join(repoRoot, "skills", "brighty-empty"), { recursive: true });
    const pluginPath = path.join(repoRoot, ".claude-plugin", "plugin.json");
    await writeJson(pluginPath, {
      name: "brighty",
      skills: ["skills/brighty-banking", "skills/brighty-empty"],
      mcpServers: ".mcp.json",
    });

    const result = await validatePlugin({ repoRoot });

    expect(
      result.errors.some((e) =>
        e.includes("plugin.skills entry missing SKILL.md: skills/brighty-empty"),
      ),
    ).toBe(true);
  });

  it("fails when a declared agents path is missing", async () => {
    const repoRoot = await writeBaselineRepo();
    cleanups.push(repoRoot);
    const pluginPath = path.join(repoRoot, ".claude-plugin", "plugin.json");
    await writeJson(pluginPath, {
      name: "brighty",
      skills: ["skills/brighty-banking", "skills/brighty-cards"],
      agents: ["agents/ghost.md"],
      mcpServers: ".mcp.json",
    });

    const result = await validatePlugin({ repoRoot });

    expect(
      result.errors.some((e) => e.includes("plugin.agents entry missing: agents/ghost.md")),
    ).toBe(true);
  });

  it("fails when a declared commands path is missing", async () => {
    const repoRoot = await writeBaselineRepo();
    cleanups.push(repoRoot);
    const pluginPath = path.join(repoRoot, ".claude-plugin", "plugin.json");
    await writeJson(pluginPath, {
      name: "brighty",
      skills: ["skills/brighty-banking", "skills/brighty-cards"],
      commands: ["commands/ghost.md"],
      mcpServers: ".mcp.json",
    });

    const result = await validatePlugin({ repoRoot });

    expect(
      result.errors.some((e) => e.includes("plugin.commands entry missing: commands/ghost.md")),
    ).toBe(true);
  });

  it("fails when .mcp.json is invalid JSON", async () => {
    const repoRoot = await writeBaselineRepo();
    cleanups.push(repoRoot);
    await writeFile(path.join(repoRoot, ".mcp.json"), "{not json", "utf8");

    const result = await validatePlugin({ repoRoot });

    expect(result.errors.some((e) => e.includes("invalid JSON in"))).toBe(true);
  });

  it("fails when .mcp.json has empty mcpServers", async () => {
    const repoRoot = await writeBaselineRepo();
    cleanups.push(repoRoot);
    await writeJson(path.join(repoRoot, ".mcp.json"), { mcpServers: {} });

    const result = await validatePlugin({ repoRoot });

    expect(
      result.errors.some((e) => e.includes(".mcp.json must contain a non-empty mcpServers object")),
    ).toBe(true);
  });

  it("fails when .mcp.json is missing entirely", async () => {
    const repoRoot = await writeBaselineRepo();
    cleanups.push(repoRoot);
    await rm(path.join(repoRoot, ".mcp.json"));

    const result = await validatePlugin({ repoRoot });

    expect(result.errors.some((e) => e.includes("missing file") && e.includes(".mcp.json"))).toBe(
      true,
    );
  });
});

describe("main()", () => {
  it("returns 0 and logs ok summary on a clean fixture", async () => {
    const repoRoot = await writeBaselineRepo();
    cleanups.push(repoRoot);

    const logs = [];
    const errors = [];
    const code = await main({
      repoRoot,
      log: (m) => logs.push(m),
      warn: () => {},
      error: (m) => errors.push(m),
    });

    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(logs.some((m) => m.startsWith("[validate-plugin] ok"))).toBe(true);
  });

  it("returns 1 and emits the failure list when a manifest is broken", async () => {
    const repoRoot = await writeBaselineRepo();
    cleanups.push(repoRoot);
    const pluginPath = path.join(repoRoot, ".claude-plugin", "plugin.json");
    await writeJson(pluginPath, {
      name: "brighty",
      skills: ["skills/brighty-missing"],
      mcpServers: ".mcp.json",
    });

    const errors = [];
    const code = await main({
      repoRoot,
      log: () => {},
      warn: () => {},
      error: (m) => errors.push(m),
    });

    expect(code).toBe(1);
    expect(errors.some((m) => m.includes("manifest is not consistent"))).toBe(true);
    expect(errors.some((m) => m.includes("plugin.skills entry not a directory"))).toBe(true);
  });
});
