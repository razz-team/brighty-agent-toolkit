# Changelog

All notable changes to `brighty-agent-toolkit` are recorded here. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the toolkit is `0.x` the API may change with any minor bump. Once we
ship `1.0.0`, breaking changes will only happen on majors.

## [Unreleased]

### Changed

- Aligned every MCP tool, type, and skill with the live Brighty Business
  OpenAPI spec at `https://apidocs.brighty.app/openapi.json`. Many tool
  signatures changed: list filters were trimmed to the documented set,
  `createdAt` is now passed as a query param on payout endpoints,
  `Idempotency-Key` is auto-generated for the transfer endpoints that
  require it, and several body fields were renamed (e.g. internal
  transfers now use `receiverUsername` instead of the prior fake
  `recipientAccountId`/`recipientTag`). All four `SKILL.md` files were
  rewritten to match.
- Switched `DEFAULT_BASE_URL` to `https://api.brighty.app/business/v1`
  (the API version path is now baked in). Operators overriding via
  `BRIGHTY_API_URL` must include `/business/v1` — for the dev
  environment that's `https://api.brighty.codes/business/v1`.
- Replaced the deprecated `keytar` keychain dependency with
  `@napi-rs/keyring`. The new binding ships prebuilt binaries for every
  platform, removes the `libsecret` requirement on Linux (so `npx`
  works in WSL2 / GitHub Codespaces / headless containers), and the
  switchover is contained behind the `KeychainProvider` adapter in
  `src/auth.ts`.
- Repositioned the toolkit as banking infrastructure for AI agents
  rather than as an Anthropic-specific plugin. The README now lists
  three equal artifacts: the MCP server (works with any MCP client),
  four AgentSkills-spec skills (work in any AgentSkills client), and
  the Anthropic plugin manifest (one of three distribution wrappers).
- npm scope renamed to `@brighty-app/mcp-server` (the org reserved on
  npmjs.com).

### Removed

- HTTP / hosted / OAuth roadmap entries. The server is stdio-only by
  design, not as a temporary state. The security guardrail "do not run
  this server behind a public HTTP endpoint" stays — see
  `docs/SECURITY.md`.

### Added

- `.github/workflows/release-mcp.yml` — tag-triggered npm publish with
  provenance via OIDC trusted publisher (no `NPM_TOKEN` secret).
- `BRIGHTY_API_URL` is now forwarded through `.mcp.json`'s `env` block
  so MCP clients can override the API endpoint without re-installing
  the plugin.
- `repository`, `homepage`, and `bugs` fields in
  `packages/mcp-server/package.json` (required for `npm publish
--provenance`).

## [0.0.1] — 2026-05-04

Initial public preview. Manual `npm publish` from a developer machine
to register the `@brighty-app/mcp-server` name on npm; future releases
go through the tag-triggered workflow.

[Unreleased]: https://github.com/razz-team/brighty-agent-toolkit/compare/mcp-server-v0.0.1...HEAD
[0.0.1]: https://github.com/razz-team/brighty-agent-toolkit/releases/tag/mcp-server-v0.0.1
