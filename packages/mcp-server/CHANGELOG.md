# @brighty-app/mcp-server

## 0.0.2

### Patch Changes

- [#3](https://github.com/razz-team/brighty-agent-toolkit/pull/3) [`7506427`](https://github.com/razz-team/brighty-agent-toolkit/commit/75064275d021542abd95fdce5f922c37465782c1) Thanks [@olegshilov](https://github.com/olegshilov)! - First working preview after the OpenAPI re-anchor.

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
    `ubuntu-latest` with `actions/checkout@v6` and `actions/setup-node@v6`,
    reading the Node version from `.nvmrc` (currently `24.15`). Yarn
    comes from corepack (the `packageManager` field in root
    `package.json`); the Yarn Berry cache (`.yarn/cache`) is restored
    across runs via `cache: yarn`.
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

This file is managed by [Changesets](https://github.com/changesets/changesets).
New entries are written by the `chore: version packages` PR that the
`changesets-release` workflow opens after a PR with a changeset lands
on `master`. See [`docs/CHANGESETS.md`](../../docs/CHANGESETS.md) for
the developer workflow.

The package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While we're `0.x` the API may change with any patch bump; breaking
changes are flagged with `BREAKING:` at the start of the changeset
summary. Once we ship `1.0.0`, breaking changes will only happen on
majors.

## 0.0.1

Initial public preview. Manual `npm publish` from a developer machine
to register the `@brighty-app/mcp-server` name on npm.
