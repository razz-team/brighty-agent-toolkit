#!/usr/bin/env node
// Cross-reference check between SKILL.md files and registered MCP tools.
//
// Invariant: every brighty_* identifier mentioned in any SKILL.md must be a
// real tool defined under packages/mcp-server/src/tools/. The opposite case
// (tool exists in code but no skill mentions it) is a warning, not an error,
// so internal helpers and not-yet-documented tools don't break CI.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL_MENTION_RE = /\bbrighty_[a-z][a-z0-9_]*\b/g;
// Match the canonical declaration site: `name: "brighty_..."` inside a
// defineBrightyTool({...}) call. Cross-tool references inside description
// strings deliberately don't match — only registrations count.
const CODE_DECLARATION_RE = /\bname\s*:\s*["'](brighty_[a-z][a-z0-9_]*)["']/g;

async function readDirEntries(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
}

export async function collectSkillTools(skillsDir) {
  const skillTools = new Map();
  for (const entry of await readDirEntries(skillsDir)) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(skillsDir, entry.name, "SKILL.md");
    let body;
    try {
      body = await fs.readFile(skillFile, "utf8");
    } catch (err) {
      if (err && err.code === "ENOENT") continue;
      throw err;
    }
    for (const match of body.matchAll(SKILL_MENTION_RE)) {
      const tool = match[0];
      const skills = skillTools.get(tool) ?? [];
      if (!skills.includes(entry.name)) skills.push(entry.name);
      skillTools.set(tool, skills);
    }
  }
  return skillTools;
}

export async function collectCodeTools(toolsDir) {
  const codeTools = new Set();
  async function walk(dir) {
    for (const entry of await readDirEntries(dir)) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        const body = await fs.readFile(full, "utf8");
        for (const match of body.matchAll(CODE_DECLARATION_RE)) {
          codeTools.add(match[1]);
        }
      }
    }
  }
  await walk(toolsDir);
  return codeTools;
}

export async function checkToolReferences({ skillsDir, toolsDir }) {
  const skillTools = await collectSkillTools(skillsDir);
  const codeTools = await collectCodeTools(toolsDir);

  const missing = [];
  for (const [tool, skills] of skillTools) {
    if (!codeTools.has(tool)) missing.push({ tool, skills: [...skills] });
  }
  missing.sort((a, b) => a.tool.localeCompare(b.tool));

  const orphans = [];
  for (const tool of codeTools) {
    if (!skillTools.has(tool)) orphans.push(tool);
  }
  orphans.sort();

  return { skillTools, codeTools, missing, orphans };
}

function defaultPaths() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..");
  return {
    skillsDir: path.join(repoRoot, "skills"),
    toolsDir: path.join(repoRoot, "packages", "mcp-server", "src", "tools"),
  };
}

export async function main({ log = console.log, warn = console.warn, error = console.error } = {}) {
  const { skillsDir, toolsDir } = defaultPaths();
  const { skillTools, codeTools, missing, orphans } = await checkToolReferences({
    skillsDir,
    toolsDir,
  });

  if (missing.length) {
    error("[check-tools] skills reference tools that do not exist in code:");
    for (const { tool, skills } of missing) {
      error(`  ${tool}  (referenced by: ${skills.join(", ")})`);
    }
    return 1;
  }

  if (orphans.length) {
    warn("[check-tools] tools registered in code but not mentioned in any skill (warning):");
    for (const tool of orphans) warn(`  ${tool}`);
  }

  log(
    `[check-tools] ok — ${skillTools.size} skill reference(s), ${codeTools.size} registered tool(s), ${orphans.length} orphan(s)`,
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
      console.error("[check-tools] fatal:", err);
      process.exit(2);
    });
}
