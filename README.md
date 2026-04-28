# brighty-agent-toolkit

MCP server and skills for [Brighty](https://brighty.app) — banking infrastructure for AI agents. Open accounts, issue cards, send SEPA/SWIFT payments, run mass payouts, and pay invoices through natural language.

This repository is an [Anthropic plugin](https://code.claude.com/docs/en/plugin-marketplaces) that bundles:

- A self-hostable MCP server exposing the Brighty API over stdio
- Four [AgentSkills](https://agentskills.io/)-spec skills (banking, payouts, invoice payment, card management)

Specialized agents and slash commands for common workflows are planned for v0.2 — see the [roadmap note](#roadmap) below.

The skills follow the open AgentSkills standard and work in Claude Code, Claude Desktop, OpenAI Codex, Cursor, OpenClaw, and any compatible client. The plugin wrapper is Anthropic-specific.

## Quick start

> **v0.1 status:** `@brighty/mcp-server` is not yet on npm and the plugin is not yet on the Claude Code marketplace. The install path that works today is the local checkout below; the marketplace and ClawHub flows activate with the v0.1 release.

### Local checkout (v0.1)

```
git clone https://github.com/razz-team/brighty-agent-toolkit
cd brighty-agent-toolkit
corepack enable
yarn install
yarn workspace @brighty/mcp-server build
```

Then point your MCP client `command` at `node /absolute/path/to/brighty-agent-toolkit/packages/mcp-server/dist/index.js`. Provide your Brighty API key via the `BRIGHTY_API_KEY` environment variable, or store it once in the OS keychain by running `yarn login` from the repo root (see [Authentication](#authentication) for the global-install and plugin-flow alternatives). Get the key from the [Brighty Business Portal](https://business.brighty.app/account/business) (Owner role only).

To copy skills only (any AgentSkills-compatible client — Codex, Cursor, OpenClaw, etc.):

```
cp -r skills/* ~/.claude/skills/
# or ~/.codex/skills/, ~/.agents/skills/, etc.
```

### Claude Code / Claude Desktop (after v0.1 release)

```
/plugin marketplace add razz-team/brighty-agent-toolkit
/plugin install brighty@brighty-agent-toolkit
```

This registers the local stdio MCP server (via `npx -y -p @brighty/mcp-server@0.1.0 brighty-mcp` — the `-p` form is required because the package ships two bins, `brighty-mcp` and `brighty-mcp-login`, neither of which matches the unscoped package name) and installs all four skills. The bundled `.mcp.json` pins the server version to match the plugin manifest version, so the npm dist-tag does not float independently of the plugin release. Bump both together when cutting a new plugin version.

### OpenClaw (ClawHub) (after skill publish)

Skills are published individually. Install only what you need:

```
clawhub install brighty-banking
clawhub install brighty-payouts
clawhub install brighty-invoice-pay
clawhub install brighty-cards
```

The MCP server is not auto-configured on OpenClaw — add it manually via your gateway config.

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

`packages/mcp-server` is a TypeScript MCP server exposing 24 tools across accounts, payouts, transfers, cards, and members. Tool source lives in `packages/mcp-server/src/tools/<domain>/<tool-name>.ts` (one tool per file). v0.1 supports the **stdio** transport only; HTTP / hosted is on the [roadmap](#roadmap).

## Alternative installation

### Local stdio MCP only (no plugin, after npm publish)

Once `@brighty/mcp-server` is published:

```
npm install -g @brighty/mcp-server@0.1.0
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

Pin the version explicitly (`@0.1.0`) so the global install does not pick up newer majors when you upgrade the plugin.

## Authentication

The server reads the Brighty API key in this order:

1. `BRIGHTY_API_KEY` environment variable (preferred for CI, Docker, ephemeral hosts).
2. OS keychain entry `brighty-mcp / default` (preferred for personal workstations).

If neither is set, the server exits with an actionable error. There is no `~/.brighty/config.json` and no MCP tool that writes credentials — credential mutation is intentionally an out-of-band CLI step. See [`docs/SECURITY.md`](docs/SECURITY.md) for the full threat model.

To populate the keychain, run the bundled CLI:

```
# After a global npm install of @brighty/mcp-server (puts brighty-mcp on PATH):
brighty-mcp login

# From a local checkout (the bin is a workspace-only script, not on PATH):
yarn login

# Plugin / no-install path (uses the same CLI without a global install):
npx -y -p @brighty/mcp-server brighty-mcp login

# In every case:
# Brighty API key: <paste key>
```

The CLI validates the key against `GET /me` before saving and masks it in any output. To clear the entry, delete the `brighty-mcp` item via your OS keychain UI (Keychain Access on macOS, `secret-tool` on Linux, Credential Manager on Windows).

To point the server at a non-production Brighty environment (staging, sandbox, mock), set `BRIGHTY_API_URL` (defaults to `https://api.brighty.app`).

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
yarn workspace @brighty/mcp-server build
yarn workspace @brighty/mcp-server test
```

CI runs the above on every PR. The cross-reference check between skill instructions and MCP tool definitions is the load-bearing invariant: renaming a tool without updating the corresponding skill fails the build.

## Contributing

PRs welcome. Before submitting:

1. `yarn validate-plugin && yarn validate && yarn check-tools` must pass locally.
2. `yarn workspace @brighty/mcp-server test` must pass.
3. Keep each `SKILL.md` under 500 lines. Move details into `skills/<name>/references/`.
4. No obfuscated scripts in `skills/*/scripts/` — they fail VirusTotal scanning on ClawHub publication and erode trust.

## Security

Never commit API keys. The MCP server reads `BRIGHTY_API_KEY` from the environment or the OS keychain (entry `brighty-mcp / default`) — see [Authentication](#authentication). For self-hosted multi-user deployments (HTTP / hosted), see the roadmap; v0.1 is stdio-only and intended for single-operator use.

Report security issues to security@brighty.app, not via public issues.

## Roadmap

- **v0.1 (current):** stdio MCP server (24 tools), four skills, plugin manifest with skills only.
- **v0.2:** specialized agents (`agents/bookkeeper.md`, `agents/payroll-runner.md`) and slash commands (`commands/pay-invoice.md`). The directory layout is reserved; manifest entries land once the agents are authored.
- **Later:** HTTP / hosted transport with OAuth 2.1 façade, Docker / GHCR images, npm publish, and `release-*.yml` workflows for npm + ClawHub publishing.

## License

MIT for the MCP server source and skill instructions. See [`LICENSE`](LICENSE). The Brighty name and logo remain property of Brighty Holding Ltd.

## Links

- [Brighty Business Portal](https://business.brighty.app) — API keys
- [Brighty API docs](https://apidocs.brighty.app)
- [AgentSkills spec](https://agentskills.io/specification)
- [Claude Code plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
