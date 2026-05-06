# brighty-agent-toolkit

[![npm](https://img.shields.io/npm/v/@brighty-app/mcp-server?label=%40brighty-app%2Fmcp-server)](https://www.npmjs.com/package/@brighty-app/mcp-server)
[![CI](https://github.com/razz-team/brighty-agent-toolkit/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/razz-team/brighty-agent-toolkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/@brighty-app/mcp-server)](./packages/mcp-server/package.json)
[![AgentSkills](https://img.shields.io/badge/AgentSkills-spec-blueviolet)](https://agentskills.io/specification)

Banking infrastructure for AI agents. Use [Brighty](https://brighty.app) from Claude, Codex, Cursor, OpenClaw, or any MCP-compatible client to open accounts, issue cards, send SEPA/SWIFT payments, run mass payouts, and pay invoices — all through natural language.

This repository ships three things in one place:

- **MCP server** — exposes the Brighty API as 24 tools over stdio. Works with any MCP client.
- **AgentSkills** — four [AgentSkills](https://agentskills.io/)-spec skills (banking, payouts, invoice payment, card management) that teach an agent when and how to call the tools. Work in any AgentSkills-compatible client (Claude, Codex, Cursor, OpenClaw, ...).
- **Anthropic plugin manifest** — bundles the above for one-command install via `/plugin marketplace add` in Claude Code or Claude Desktop. The plugin wrapper is Anthropic-specific; the underlying MCP server and skills are not.

Specialized agents and slash commands for common workflows are planned for 0.1 — see the [roadmap note](#roadmap) below.

## Quick start

> **Status:** Published to npm as `@brighty-app/mcp-server` and installable as a Claude Code plugin from this GitHub repo. ClawHub publishing of individual skills is on the roadmap, not done.

Get a Brighty API key from the [Brighty Business Portal](https://business.brighty.app/account/business) — Owner role only. Set it as the `BRIGHTY_API_KEY` environment variable, or store it once in the OS keychain via the bundled login CLI (see [Authentication](#authentication)).

### Claude Code / Claude Desktop (recommended)

```
/plugin marketplace add razz-team/brighty-agent-toolkit
/plugin install brighty@brighty-agent-toolkit
```

This registers the stdio MCP server (via `npx -y -p @brighty-app/mcp-server@<pinned-version> brighty-mcp` — the `-p` form is required because the package ships two bins, `brighty-mcp` and `brighty-mcp-login`, neither of which matches the unscoped package name) and installs all four skills. The bundled `.mcp.json` pins the server version to match the plugin manifest version, so the npm dist-tag does not float independently of the plugin release. The two are kept in sync automatically by `scripts/sync-versions.mjs` when changesets bumps the package — see [`docs/CHANGESETS.md`](docs/CHANGESETS.md).

`BRIGHTY_API_KEY` and (optionally) `BRIGHTY_API_URL` are forwarded from the environment of whatever shell you launch Claude Code from — set them before launch.

### Local checkout (development / unpublished features)

```
git clone https://github.com/razz-team/brighty-agent-toolkit
cd brighty-agent-toolkit
corepack enable
yarn install
yarn workspace @brighty-app/mcp-server build
```

Then point your MCP client `command` at `node /absolute/path/to/brighty-agent-toolkit/packages/mcp-server/dist/index.js`.

### Skills only — any AgentSkills-compatible client

```
cp -r skills/* ~/.claude/skills/
# or ~/.codex/skills/, ~/.agents/skills/, etc.
```

The skills assume the Brighty MCP server is reachable over stdio — set it up in your client first, then drop the skill files in.

### Ask your agent to install it

If you'd rather have your agent run the install for you, paste this prompt:

```
Install Brighty into this client. Read
https://github.com/razz-team/brighty-agent-toolkit/blob/master/AGENTS.md
and follow the path matching the client we're in.
```

[`AGENTS.md`](./AGENTS.md) walks the agent through Claude Code, generic MCP clients, skill-only setups, and credential persistence.

## What's inside

### Skills

| Skill                 | Use case                                                              |
| --------------------- | --------------------------------------------------------------------- |
| `brighty-banking`     | Balances, account info, transfers between own accounts, basic queries |
| `brighty-payouts`     | Mass payouts, payroll runs, CSV/Excel ingestion                       |
| `brighty-invoice-pay` | Pay an invoice from a PDF or image                                    |
| `brighty-cards`       | Issue, freeze, set limits on business cards                           |

Each skill is self-contained and installs independently. They all assume the Brighty MCP server is reachable over stdio.

### MCP server

`packages/mcp-server` is a TypeScript MCP server exposing 24 tools across accounts, payouts, transfers, cards, and members. Tool source lives in `packages/mcp-server/src/tools/<domain>/<tool-name>.ts` (one tool per file). The server runs over **stdio** as a subprocess of the agent client — this is the design, not a temporary state.

## Alternative installation

### Local stdio MCP only (no plugin)

```
npm install -g @brighty-app/mcp-server@latest
```

Then add to your client config (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "brighty": {
      "command": "brighty-mcp",
      "env": { "BRIGHTY_API_KEY": "your-key" }
    }
  }
}
```

For reproducible installs, pin the version explicitly instead of `@latest` — e.g. `@brighty-app/mcp-server@0.0.2`. The `npx -y -p ...` form in the plugin path always pins to a specific version via `.mcp.json`.

## Authentication

The server reads the Brighty API key in this order:

1. `BRIGHTY_API_KEY` environment variable (preferred for CI, Docker, ephemeral hosts).
2. OS keychain entry `brighty-mcp / default` (preferred for personal workstations).

If neither is set, the server exits with an actionable error. There is no `~/.brighty/config.json` and no MCP tool that writes credentials — credential mutation is intentionally an out-of-band CLI step. See [`docs/SECURITY.md`](docs/SECURITY.md) for the full threat model.

To populate the keychain, run the bundled CLI:

```
# After a global npm install of @brighty-app/mcp-server (puts brighty-mcp on PATH):
brighty-mcp login

# From a local checkout (the bin is a workspace-only script, not on PATH):
yarn login

# Plugin / no-install path (uses the same CLI without a global install):
npx -y -p @brighty-app/mcp-server brighty-mcp login

# In every case:
# Brighty API key: <paste key>
```

The CLI validates the key against `GET /accounts` (the lightest authenticated endpoint on the Brighty Business API) before saving and masks it in any output. To clear the entry, delete the `brighty-mcp` item via your OS keychain UI (Keychain Access on macOS, `secret-tool` on Linux, Credential Manager on Windows).

To point the server at a non-production Brighty environment (staging, sandbox, mock), set `BRIGHTY_API_URL` to the **full base URL including the API version path** — defaults to `https://api.brighty.app/business/v1`. Example for the dev environment: `BRIGHTY_API_URL=https://api.brighty.codes/business/v1`.

## Repository structure

```
.
├── .claude-plugin/
│   ├── marketplace.json     # plugin marketplace registration
│   └── plugin.json          # plugin manifest (skills + MCP server)
├── .mcp.json                # default MCP server connection (stdio)
├── packages/
│   └── mcp-server/          # TypeScript MCP server, 24 tools
├── skills/                  # AgentSkills-spec skills (publishable as-is)
│   ├── brighty-banking/
│   ├── brighty-payouts/
│   ├── brighty-invoice-pay/
│   └── brighty-cards/
├── docs/                    # SECURITY.md, plans/
└── scripts/                 # CI utilities (validate-plugin, check-tool-references)
```

## Development

```
corepack enable
yarn install
yarn validate-plugin            # verify plugin manifest matches the file tree
yarn validate                   # validate all skills against AgentSkills spec
yarn check-tools                # ensure SKILL.md tool references match MCP source
yarn workspace @brighty-app/mcp-server build
yarn workspace @brighty-app/mcp-server test
```

CI runs the above on every PR. The cross-reference check between skill instructions and MCP tool definitions is the load-bearing invariant: renaming a tool without updating the corresponding skill fails the build.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full guide. Short version: every PR has to keep the `validate-plugin` / `validate` / `check-tools` invariants green, every new MCP tool or schema change is cross-checked against the [Brighty OpenAPI spec](https://apidocs.brighty.app/openapi.json), and credential-mutating tools are off-limits (see [`docs/SECURITY.md`](./docs/SECURITY.md)).

## Changelog

[`CHANGELOG.md`](./CHANGELOG.md) — Keep a Changelog format. Bump notes for each release plus an `[Unreleased]` section for what's queued.

## Security

Never commit API keys. The MCP server reads `BRIGHTY_API_KEY` from the environment or the OS keychain (entry `brighty-mcp / default`) — see [Authentication](#authentication). The server is stdio-only and intended for single-operator use on the operator's own machine — not for shared/public hosting.

Report security issues to security@brighty.app, not via public issues.

## Roadmap

See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for what's shipped, what's planned for the next release, and what's deferred.

## License

MIT for the MCP server source and skill instructions. See [`LICENSE`](LICENSE). The Brighty name and logo remain property of Brighty Holding Ltd.

## Links

- [Brighty Business Portal](https://business.brighty.app) — API keys
- [Brighty API docs](https://apidocs.brighty.app)
- [AgentSkills spec](https://agentskills.io/specification)
- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
