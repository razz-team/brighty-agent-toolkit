#!/usr/bin/env node
// Post-version sync. Changesets bumps version in
// `packages/mcp-server/package.json`; this script propagates that value
// to every other place we hard-code a version of `@brighty-app/mcp-server`
// (the .mcp.json `@x.y.z` pin, the plugin manifest, the SERVER_VERSION
// constant, the root package.json), and bumps each `skills/*/SKILL.md`
// frontmatter version to keep the toolkit aligned.
//
// Run via the `version` script in root package.json so changesets
// invokes it at the right point in the release flow:
//   "version": "changeset version && node scripts/sync-versions.mjs"
//
// The script is idempotent and safe to re-run by hand if something
// drifts out of sync between releases.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const MCP_PACKAGE_JSON = path.join(repoRoot, "packages/mcp-server/package.json");
const ROOT_PACKAGE_JSON = path.join(repoRoot, "package.json");
const PLUGIN_JSON = path.join(repoRoot, ".claude-plugin/plugin.json");
const MCP_JSON = path.join(repoRoot, ".mcp.json");
const SERVER_VERSION_TS = path.join(repoRoot, "packages/mcp-server/src/index.ts");
const SKILLS_DIR = path.join(repoRoot, "skills");

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  // Preserve trailing newline for git-friendliness; oxfmt also expects it.
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function syncMcpJson(version) {
  const raw = await fs.readFile(MCP_JSON, "utf8");
  const json = JSON.parse(raw);
  const args = json.mcpServers?.brighty?.args;
  if (!Array.isArray(args)) {
    // Local dev override path (command: node /local/dist/index.js) — leave
    // it alone, it doesn't need a version pin.
    return false;
  }
  let modified = false;
  for (let i = 0; i < args.length; i++) {
    const m = args[i].match(/^@brighty-app\/mcp-server(@[^"\s]+)?$/);
    if (m) {
      args[i] = `@brighty-app/mcp-server@${version}`;
      modified = true;
    }
  }
  if (modified) {
    await writeJson(MCP_JSON, json);
  }
  return modified;
}

async function syncRootPackageJson(version) {
  const json = await readJson(ROOT_PACKAGE_JSON);
  if (json.version === version) return false;
  json.version = version;
  await writeJson(ROOT_PACKAGE_JSON, json);
  return true;
}

async function syncPluginJson(version) {
  const json = await readJson(PLUGIN_JSON);
  if (json.version === version) return false;
  json.version = version;
  await writeJson(PLUGIN_JSON, json);
  return true;
}

async function syncServerVersion(version) {
  const raw = await fs.readFile(SERVER_VERSION_TS, "utf8");
  const updated = raw.replace(/(const SERVER_VERSION\s*=\s*")[^"]+(";)/, `$1${version}$2`);
  if (updated === raw) return false;
  await fs.writeFile(SERVER_VERSION_TS, updated, "utf8");
  return true;
}

async function syncSkills(version) {
  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  const updated = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(SKILLS_DIR, entry.name, "SKILL.md");
    let raw;
    try {
      raw = await fs.readFile(skillFile, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    }
    const next = raw.replace(/(version:\s*")[^"]+(")/, `$1${version}$2`);
    if (next !== raw) {
      await fs.writeFile(skillFile, next, "utf8");
      updated.push(entry.name);
    }
  }
  return updated;
}

async function main() {
  const mcp = await readJson(MCP_PACKAGE_JSON);
  const version = mcp.version;
  if (!version || typeof version !== "string") {
    console.error(
      "[sync-versions] missing or non-string version in packages/mcp-server/package.json",
    );
    process.exit(1);
  }

  console.log(`[sync-versions] target version: ${version}`);

  const mcpJsonChanged = await syncMcpJson(version);
  const rootChanged = await syncRootPackageJson(version);
  const pluginChanged = await syncPluginJson(version);
  const serverChanged = await syncServerVersion(version);
  const skillsChanged = await syncSkills(version);

  console.log(`[sync-versions] .mcp.json:           ${mcpJsonChanged ? "updated" : "unchanged"}`);
  console.log(`[sync-versions] package.json (root): ${rootChanged ? "updated" : "unchanged"}`);
  console.log(`[sync-versions] plugin.json:         ${pluginChanged ? "updated" : "unchanged"}`);
  console.log(`[sync-versions] SERVER_VERSION:      ${serverChanged ? "updated" : "unchanged"}`);
  console.log(
    `[sync-versions] skills:              ${skillsChanged.length} updated (${skillsChanged.join(", ") || "none"})`,
  );
}

main().catch((err) => {
  console.error("[sync-versions] fatal:", err);
  process.exit(1);
});
