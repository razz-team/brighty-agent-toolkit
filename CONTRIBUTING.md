# Contributing

Thanks for considering a PR. The contribution surface today is narrow:
this is a single-vendor toolkit (Brighty's banking API) with a
load-bearing cross-reference between skill content and MCP tool source.
Most welcome contributions are bug fixes, doc improvements, and adding
tools / skills for endpoints that already exist on the Brighty API.

## Before you open a PR

Run all of these locally — CI runs the same and will reject anything
that fails:

```
corepack enable
yarn install --immutable
yarn validate-plugin     # plugin manifest ↔ filesystem consistency
yarn validate            # AgentSkills spec validation for all skills
yarn check-tools         # cross-reference SKILL.md ↔ MCP tool source
yarn lint
yarn format:check        # use `yarn format` to auto-fix
yarn build
yarn test
```

The `check-tools` script is the most likely to surprise you. It walks
every `SKILL.md` and confirms each `brighty_*` tool name it references
is exported from `packages/mcp-server/src/tools/<domain>/`. If you
rename a tool and forget to update the skill (or vice versa), CI fails.

## Repository conventions

Codified in [`CLAUDE.md`](./CLAUDE.md). Highlights:

- Skills are kebab-case, prefixed `brighty-` (e.g. `brighty-payouts`).
- MCP tools are `snake_case`, prefixed with `brighty_` (e.g. `brighty_create_payout`).
- Reference files inside `skills/<name>/references/` are
  `SCREAMING_SNAKE_CASE.md`.
- TypeScript files are kebab-case (`create-payout.ts`).
- One MCP tool per file under `packages/mcp-server/src/tools/<domain>/`,
  re-exported from `tools/<domain>/index.ts`.
- Brighty errors arrive as `{ errorCode, name, description, params? }`
  — surface `description` to the user verbatim.

## Adding a new skill

1. `skills/<skill-name>/SKILL.md` with the standard frontmatter.
2. Reference any MCP tools by their actual `brighty_*` snake_case name.
3. Add the skill path to `.claude-plugin/plugin.json` if you also want
   it bundled into the Anthropic plugin (the skill itself works
   independently in any AgentSkills client either way).
4. `yarn validate && yarn check-tools` must pass.
5. Keep `SKILL.md` under 500 lines. Long material moves into
   `references/`.

## Adding a new MCP tool

1. Source under `packages/mcp-server/src/tools/<domain>/<tool-name>.ts`.
2. Re-export from `tools/<domain>/index.ts` so it lands in the
   domain's `*Tools` array.
3. Update the relevant `SKILL.md` to document when and how the agent
   should call it. `yarn check-tools` will fail otherwise.
4. Cross-reference the request body / response shape against the
   Brighty OpenAPI spec at
   <https://apidocs.brighty.app/openapi.json>. Don't guess fields.
5. Add tests under `packages/mcp-server/test/tools/<domain>.test.ts`
   that mock the client and assert the URL, body, query, and headers.

## Versioning

Every PR that changes the published package needs a changeset. Add it
with `yarn changeset` — the CLI prompts for bump kind (`patch` /
`minor` / `major`) and a summary. Commit the resulting
`.changeset/*.md` file with the rest of your PR.

Doc-only and workflow-only PRs don't need a changeset. See
[`docs/CHANGESETS.md`](./docs/CHANGESETS.md) for the full workflow,
including what the post-merge "version packages" PR does and when
you'll see it.

## Releasing

The release flow is two-staged on purpose:

1. **changesets-release workflow** opens a "version packages" PR that
   bumps `packages/mcp-server/package.json`, updates `CHANGELOG.md`,
   and runs `scripts/sync-versions.mjs` to propagate the bump to
   `.mcp.json`, `plugin.json`, `SERVER_VERSION`, and skill
   frontmatter. Review and merge that PR like a normal one.
2. **release-mcp.yml workflow** fires on tag pushes matching
   `mcp-server-v*`. After the version PR lands on master, the
   maintainer cuts the tag manually:

   ```sh
   git checkout master && git pull
   PKG_VERSION=$(node -p "require('./packages/mcp-server/package.json').version")
   git tag "mcp-server-v${PKG_VERSION}"
   git push origin "mcp-server-v${PKG_VERSION}"
   ```

   The tag push triggers `npm publish --provenance --access public`
   via OIDC trusted publisher and creates the GitHub Release.

Don't manually `npm publish` after the first preview — the workflow
is the canonical path. See [`docs/SECURITY.md`](./docs/SECURITY.md)
and [`docs/CHANGESETS.md`](./docs/CHANGESETS.md) for details.

## What we won't accept

- Tools that take credentials as arguments. `brighty_setup` was
  deliberately removed; do not re-introduce credential-mutating tools.
  See "Threat model: prompt-injected credential writes" in
  `docs/SECURITY.md`.
- Obfuscated or networked scripts under `skills/*/scripts/`. They fail
  VirusTotal scanning on ClawHub publication and erode trust.
- Hard-coded `https://api.brighty.app` paths in skill bodies. Reference
  the MCP tool names; let the transport be the operator's concern.
- Wide-impact refactors with no behaviour change. Stay focused.

## Reporting security issues

Don't open a public issue. Email `security@brighty.app` and the team
will respond.
