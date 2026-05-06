---
"@brighty-app/mcp-server": patch
---

First working preview after the OpenAPI re-anchor.

`0.0.1` was a name-reservation publish; many of its tool URL paths and
request bodies didn't match the live Brighty Business API, so most
calls would 4xx. This release re-anchors every tool, type, and skill
on the OpenAPI 3.1.0 spec at `apidocs.brighty.app`: real list filters,
real body shapes (`receiverUsername`, `payoutCreatedAt`, auto-generated
`Idempotency-Key` for required-key endpoints), real response types,
real enum values (`PayoutState` `CREATED|STARTED|COMPLETED`,
`MembershipRole` `MEMBER|VIEWER|PAYER|ADMIN|OWNER`, `CardState` six
values, `FormFactor` instead of `kind`), and the
`{errorCode, name, description, params}` error envelope.

Other notable changes:

- `DEFAULT_BASE_URL` now bakes `/business/v1` into the base path.
  Operators overriding via `BRIGHTY_API_URL` must include the version
  path — e.g. `https://api.brighty.codes/business/v1` for the dev
  environment.
- `BRIGHTY_API_URL` is now forwarded through `.mcp.json`'s `env`
  block so MCP clients can point the server at a non-prod endpoint
  without re-installing the plugin. Empty-string values fall back to
  `DEFAULT_BASE_URL`.
- Startup auth probe moved from `/me` (which doesn't exist on the
  Brighty API) to `/accounts` — the lightest authenticated GET.
- Replaced deprecated `keytar` with `@napi-rs/keyring`. Drop-in via
  the `KeychainProvider` adapter in `src/auth.ts`. No `libsecret`
  requirement on Linux; prebuilt binaries for every platform so
  `npx` works in WSL2 / Codespaces / headless containers.
- Repositioned the toolkit as banking infrastructure for AI agents,
  not an Anthropic-specific plugin. Added `AGENTS.md` install guide
  for autonomous agents, `CHANGELOG.md` (Keep a Changelog),
  `CONTRIBUTING.md`, root `SECURITY.md`, README badges (npm, CI,
  license, node, AgentSkills).
- Plugin manifest schema fixes: `marketplace.json` `owner` is now an
  object, `plugin.json` uses single string paths for `skills` and
  `mcpServers`. Both fixes were required by the current Claude Code
  marketplace validator.
- `ci.yml` and `changesets-release.yml` run on GitHub-hosted
  `ubuntu-latest` with `actions/checkout@v6` and explicit
  `actions/setup-node@v4` pinning to Node 24. Yarn comes from
  corepack (the `packageManager` field in root `package.json`).
- Release pipeline simplified to a single `changesets-release.yml`
  workflow that opens version-packages PRs and publishes on merge
  (with provenance via OIDC). The previous tag-triggered
  `release-mcp.yml` is gone.
- **Node engine requirement raised to `>=24`.** Earlier 0.0.1 declared
  `>=20`, which no longer matches the dev/CI baseline. Operators on
  Node 20–23 must upgrade before installing.
- Runtime dependency **zod bumped from 3.25 to 4.4.** The MCP SDK
  (1.29) supports both, so this only matters if you're consuming the
  emitted types directly — tool input schemas keep the same shape.
- All `package.json` deps and devDeps pinned to exact versions
  (no `^` ranges) for reproducible installs.

All four `SKILL.md` files rewritten to reflect the corrected API
shapes, error envelope, and lifecycle states.
