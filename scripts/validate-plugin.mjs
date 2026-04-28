#!/usr/bin/env node
// Plugin manifest validator.
//
// Cross-checks .claude-plugin/marketplace.json, .claude-plugin/plugin.json and
// .mcp.json so that an obvious wiring mistake (renamed plugin, dangling skill
// path, malformed mcp config) is caught before a release ships.
//
// Rules enforced:
//   - marketplace.plugins[].name matches plugin.name (when the marketplace lists
//     a plugin pointing at this repo via "./" source).
//   - Every plugin.skills[] path resolves to a directory containing SKILL.md.
//   - Every plugin.agents[] path resolves to a regular file (when declared).
//   - Every plugin.commands[] path resolves to a regular file (when declared).
//   - .mcp.json is valid JSON and contains a non-empty mcpServers object.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

async function readJson(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      const error = new Error(`missing file: ${filePath}`);
      error.code = "ENOENT";
      throw error;
    }
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid JSON in ${filePath}: ${err.message}`, { cause: err });
  }
}

async function statSafe(target) {
  try {
    return await fs.stat(target);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

export async function validatePlugin({ repoRoot }) {
  const errors = [];
  const warnings = [];

  const marketplacePath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
  const pluginPath = path.join(repoRoot, ".claude-plugin", "plugin.json");
  const mcpPath = path.join(repoRoot, ".mcp.json");

  let marketplace;
  try {
    marketplace = await readJson(marketplacePath);
  } catch (err) {
    errors.push(err.message);
  }

  let plugin;
  try {
    plugin = await readJson(pluginPath);
  } catch (err) {
    errors.push(err.message);
  }

  if (marketplace && plugin) {
    const localPlugins = Array.isArray(marketplace.plugins)
      ? marketplace.plugins.filter(
          (p) => typeof p?.source === "string" && p.source.startsWith("./"),
        )
      : [];
    if (localPlugins.length === 0) {
      warnings.push(
        "marketplace.json does not list any local plugin (source starting with './'); skipping name match",
      );
    } else {
      for (const entry of localPlugins) {
        if (entry.name !== plugin.name) {
          errors.push(
            `name mismatch: marketplace plugin "${entry.name}" (source ${entry.source}) does not equal plugin.json name "${plugin.name}"`,
          );
        }
      }
    }
  }

  if (plugin) {
    const skills = Array.isArray(plugin.skills) ? plugin.skills : [];
    for (const rel of skills) {
      const dir = path.join(repoRoot, rel);
      const stat = await statSafe(dir);
      if (!stat || !stat.isDirectory()) {
        errors.push(`plugin.skills entry not a directory: ${rel}`);
        continue;
      }
      const skillFile = path.join(dir, "SKILL.md");
      const skillStat = await statSafe(skillFile);
      if (!skillStat || !skillStat.isFile()) {
        errors.push(`plugin.skills entry missing SKILL.md: ${rel}`);
      }
    }

    const agents = Array.isArray(plugin.agents) ? plugin.agents : [];
    for (const rel of agents) {
      const file = path.join(repoRoot, rel);
      const stat = await statSafe(file);
      if (!stat || !stat.isFile()) {
        errors.push(`plugin.agents entry missing: ${rel}`);
      }
    }

    const commands = Array.isArray(plugin.commands) ? plugin.commands : [];
    for (const rel of commands) {
      const file = path.join(repoRoot, rel);
      const stat = await statSafe(file);
      if (!stat || !stat.isFile()) {
        errors.push(`plugin.commands entry missing: ${rel}`);
      }
    }
  }

  let mcp;
  try {
    mcp = await readJson(mcpPath);
  } catch (err) {
    errors.push(err.message);
  }
  if (mcp) {
    if (
      !mcp.mcpServers ||
      typeof mcp.mcpServers !== "object" ||
      Array.isArray(mcp.mcpServers) ||
      Object.keys(mcp.mcpServers).length === 0
    ) {
      errors.push(".mcp.json must contain a non-empty mcpServers object");
    }
  }

  return { errors, warnings, plugin, marketplace, mcp };
}

function defaultRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

export async function main({
  repoRoot = defaultRepoRoot(),
  log = console.log,
  warn = console.warn,
  error = console.error,
} = {}) {
  const { errors, warnings, plugin } = await validatePlugin({ repoRoot });

  for (const w of warnings) warn(`[validate-plugin] ${w}`);

  if (errors.length) {
    error("[validate-plugin] manifest is not consistent:");
    for (const e of errors) error(`  ${e}`);
    return 1;
  }

  const skillCount = Array.isArray(plugin?.skills) ? plugin.skills.length : 0;
  const agentCount = Array.isArray(plugin?.agents) ? plugin.agents.length : 0;
  const commandCount = Array.isArray(plugin?.commands) ? plugin.commands.length : 0;
  log(
    `[validate-plugin] ok — plugin "${plugin?.name}" (${skillCount} skill(s), ${agentCount} agent(s), ${commandCount} command(s))`,
  );
  return 0;
}

const invokedAsMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsMain) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("[validate-plugin] fatal:", err);
      process.exit(2);
    });
}
