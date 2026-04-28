# Repository context for Claude

This file is loaded automatically by Claude Code, Cursor, and similar tools when working in this repository. It captures the conventions and invariants that aren't obvious from the file tree alone.

## What this repository is

`brighty-agent-toolkit` is a monorepo containing three things stitched together:

1. An Anthropic plugin (`.claude-plugin/`) — wraps everything below into a single installable unit
2. A TypeScript MCP server (`packages/mcp-server/`) — exposes the Brighty banking API as MCP tools (stdio in v0.1)
3. AgentSkills-spec skills (`skills/`) — teach AI agents how to use those tools effectively

Specialized agents (`agents/`) and slash commands (`commands/`) are planned for v0.2 — not present in v0.1, not declared in `plugin.json`. Self-hosting / HTTP transport / `deploy/` are tracked separately on the roadmap (see `README.md`).

Skills follow the open AgentSkills standard (https://agentskills.io). The plugin wrapper is Anthropic-specific. Same skills work in Codex, Cursor, OpenClaw — the wrapper does not.

## Critical invariants

These must hold across every change. CI enforces all of them:

- Every tool name referenced in a `SKILL.md` exists in `packages/mcp-server/src/tools/`. Cross-checked by `scripts/check-tool-references.mjs`.
- Every `SKILL.md` validates against the AgentSkills spec via `skills-ref validate`.
- `SKILL.md` body stays under 500 lines. Detailed material lives in `references/` and loads on demand.
- Skill `name` in frontmatter matches the parent directory exactly (spec requirement).
- No skill executes arbitrary code or fetches arbitrary URLs. Skills only orchestrate calls to MCP tools.

## Workflows

### Adding a new skill

1. Create `skills/<skill-name>/SKILL.md` with required frontmatter (`name`, `description`).
2. The `description` field is what the agent uses to decide when to activate the skill. Format: what the skill does + when to use it + 3-5 trigger keywords. Spec max is 1024 chars; aim for under 300.
3. Reference MCP tools by their actual snake_case name (e.g., `brighty_create_payout`).
4. Add the skill path to `.claude-plugin/plugin.json` under `skills`.
5. Run `yarn validate` and `yarn check-tools`.

### Adding a new MCP tool

1. Add the handler in `packages/mcp-server/src/tools/<domain>/<tool-name>.ts` (one tool per file) and re-export it from `tools/<domain>/index.ts` so it lands in the domain's `*Tools` array.
2. Update the relevant `SKILL.md` to document when and how the agent should call it. `yarn check-tools` enforces the cross-reference.
3. Bump version in `packages/mcp-server/package.json` and `.claude-plugin/plugin.json`.

### Updating skill instructions

- Keep instructions imperative and concrete. "Use `brighty_transfer_intent` before `brighty_transfer_own` so the user sees the rate" beats "consider using transfer intent".
- Move details into `references/`. Agents pay context cost for `SKILL.md` on every activation; references load only when needed.
- Test changes end-to-end in Claude Code locally before opening a PR.

### Cutting a release

Release workflows (`release-mcp.yml`, `release-skills.yml`, `publish-clawhub.yml`) are not implemented in v0.1 — see the Roadmap in `README.md`. Until they land, releases are manual:

1. Bump `version` in root `package.json`, `packages/mcp-server/package.json`, and `.claude-plugin/plugin.json`.
2. `git tag vX.Y.Z && git push --tags`.
3. Create a GitHub release by hand and attach skill zips if desired.

Marketplace consumers get updates via `/plugin marketplace update`.

## Conventions

### Naming

- Skills: kebab-case, prefixed with `brighty-` (`brighty-payouts`, never just `payouts`).
- MCP tools: snake*case, prefixed with `brighty*` (`brighty_create_payout`).
- Reference files: SCREAMING_SNAKE_CASE.md (`CSV_FORMAT.md`).
- TypeScript files: kebab-case (`create-payout.ts`).

### TypeScript style in `packages/mcp-server`

- Strict mode is on. No `any` without an inline justification comment.
- Tool handlers return structured data; the MCP layer serializes.
- Errors propagate as `McpError` with codes from `@modelcontextprotocol/sdk`.
- API calls go through `src/api/client.ts`. Never call `fetch` directly from a tool handler.

### Authentication

- The server reads the API key from `BRIGHTY_API_KEY` (env) first, then OS keychain entry `brighty-mcp / default` (via `keytar`). If neither is set, startup fails with `MissingApiKeyError`.
- There is **no MCP tool that writes credentials**. `brighty_setup` was deliberately removed — see `docs/SECURITY.md` ("Threat model: prompt-injected credential writes"). Credential mutation is an out-of-band CLI step (`brighty-mcp login`), not an LLM-callable action.
- The login CLI validates the key against `GET /me` before saving and masks it in any output. The keychain entry is the only persisted secret; there is no `~/.brighty/config.json`.
- Logs must mask the key. Use `maskApiKey()` from `src/auth.ts` (shows `***<last4>` only) on every surface that mentions the key.
- Startup auth is enforced by `validateStartupAuth()` before the stdio transport opens. Bypass exists for the inspector / smoke tests via `BRIGHTY_SKIP_AUTH_CHECK=1` — never set this in real client configs.

### Frontmatter style for `SKILL.md`

```
---
name: brighty-payouts
description: |
  Create batch payouts (payroll, supplier payments) using Brighty. Parses
  recipient lists from CSV, Excel, or plain text. Use when the user asks to
  pay multiple recipients at once, run payroll, or process a list of invoices.
  Triggers: payroll, mass payment, batch payout, salaries, supplier payment.
license: MIT
metadata:
  version: "0.1.0"
  author: brighty
---
```

Use the `|` block scalar for multi-line descriptions. Don't quote them.

## What not to do

- **Don't** edit a `SKILL.md` without re-running validators afterwards.
- **Don't** add scripts to `skills/*/scripts/` unless they are pure data transforms with no network or system calls. Skills are user-trust-sensitive; ad-hoc scripts trigger ClawHub VirusTotal flags and erode trust in the publisher.
- **Don't** put MCP server logic into a skill. Skills describe behavior; the server implements it.
- **Don't** hard-code `https://mcp.brighty.app` in skill bodies. Skills should work whether the user runs the server locally (stdio) or via the hosted endpoint. Reference the MCP tool name and let the transport be the user's concern.
- **Don't** introduce a global state file (like `~/.brighty/config.json`) for HTTP-mode users. That pattern is for local stdio only.
- **Don't** bump the MCP server's API surface without updating skills and `plugin.json`. CI catches it, but spare yourself the round-trip.
- **Don't** write skill instructions in second-person ("you should ..."). Write in imperative ("Call ... before ..."). Agents follow imperative more reliably.

## Useful commands

```
yarn validate                    # AgentSkills spec validation for all skills
yarn validate-plugin             # plugin manifest ↔ filesystem consistency
yarn check-tools                 # cross-reference SKILL.md ↔ MCP tools
yarn dev:server                  # tsc --watch for the MCP server (rebuilds dist on change; restart your client to pick up changes)
yarn build                       # build all workspaces
yarn test                        # run all tests
```

HTTP-mode dev server is not yet implemented (v0.1 is stdio-only).

## When stuck

- AgentSkills spec: https://agentskills.io/specification
- Skill authoring best practices: https://agentskills.io/skill-creation/best-practices
- Description optimization: https://agentskills.io/skill-creation/optimizing-descriptions
- Plugin format: https://code.claude.com/docs/en/plugin-marketplaces
- Brighty API: https://apidocs.brighty.app
- Reference plugins to compare against: https://github.com/anthropics/claude-plugins-official
