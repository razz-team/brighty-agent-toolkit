# Roadmap

What's shipped, what's next, what's later. For the latest published
version and per-release notes, see [`CHANGELOG.md`](../CHANGELOG.md).

## Current

- Stdio MCP server (24 tools across accounts, transfers, payouts,
  cards, members).
- Four skills: `brighty-banking`, `brighty-payouts`,
  `brighty-invoice-pay`, `brighty-cards`.
- Plugin manifest with skills + MCP server, installable from this
  GitHub repo via the Claude Code marketplace.
- Releases on npm with provenance via the changesets workflow — see
  [`CHANGESETS.md`](./CHANGESETS.md).

## 0.1 — specialized agents and slash commands

- Specialized subagents: `agents/bookkeeper.md`,
  `agents/payroll-runner.md`. Each one is a focused operator persona
  the user can hand a task to without re-explaining context.
- Slash commands: `commands/pay-invoice.md` and friends — one-shot
  flows the user can invoke from the Claude Code prompt.
- The directory layout (`agents/`, `commands/`) is reserved at the
  repo root; manifest entries in `.claude-plugin/plugin.json` land
  once the contents are authored.

## Later

- **ClawHub publishing for individual skills.** Each
  `brighty-*` skill becomes installable on its own via
  `clawhub install brighty-<name>`, independent of the plugin or the
  MCP server. Today users either install the whole plugin or
  `cp -r skills/*` from a clone.
- **MCP catalog submissions.** Listing on Smithery, glama.ai, and
  similar registries so the server is discoverable outside the
  Claude Code marketplace.
- **Hosted MCP** — explicitly **not planned**. The server is stdio
  only, by design. See [`docs/SECURITY.md`](./SECURITY.md) for why.

## How to propose a roadmap change

Open a PR that edits this file. Roadmap items are not invariants —
priorities shift as the toolkit gets used. If you want something
added or moved up, open a discussion or an issue with the use case
first.
