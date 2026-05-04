# Working with changesets

This repo uses [Changesets](https://github.com/changesets/changesets)
to track version bumps, `CHANGELOG.md` entries, and the actual `npm
publish` for `@brighty-app/mcp-server`. One workflow drives the whole
release: no manual `git tag`, no separate publish step.

## When to add a changeset

Any PR that changes the published package needs a changeset. Doc-only
PRs and changes that don't reach `dist/` don't need one.

Heuristic: if your PR modifies anything under `packages/mcp-server/`
or `skills/`, add a changeset. If your PR only touches `docs/`,
`CHANGELOG.md`, top-level `README.md`, `CONTRIBUTING.md`, or workflow
files, you don't need one.

## Adding a changeset

In your PR branch, run:

```sh
yarn changeset
```

The CLI prompts you to:

1. Pick which packages changed (we only have one publishable package,
   so you'll always pick `@brighty-app/mcp-server`).
2. Pick the bump kind:
   - **patch** — fixes that don't change the public surface
     (request body fix, internal refactor, doc-only changes inside
     the package).
   - **minor** — additive changes (a new tool, a new optional input,
     a new skill).
   - **major** — breaking changes (renamed tool, removed input,
     changed default behaviour). Reserve for `1.0.0` and beyond;
     while we're `0.x` use minor for breaks and put the word
     "BREAKING" at the start of the summary.
3. Write a summary. This text lands in that package's
   `CHANGELOG.md` (e.g. `packages/mcp-server/CHANGELOG.md`) and in
   the GitHub Release notes verbatim. Write it the way you want a
   future user to read it — what changed, why, what they need to do
   (if anything). One to three sentences is usually right. No
   "various improvements".

The CLI writes a markdown file to `.changeset/<random-name>.md`.
**Commit it with the rest of your PR.**

You can run `yarn changeset` multiple times in one PR if your work
spans multiple categories (e.g. one minor for a new tool plus one
patch for an unrelated fix).

## What happens after the PR merges

The `changesets-release` workflow runs on every push to master and
behaves differently depending on what's pending:

### When changesets are queued (any `.changeset/*.md` files present)

It opens or updates a "**chore: version packages**" PR. That PR:

- Bumps `packages/mcp-server/package.json` per the queued changesets
  (and any other workspace package's `package.json` that has a
  changeset queued — this is a monorepo).
- Updates each affected package's `CHANGELOG.md` (e.g.
  [`packages/mcp-server/CHANGELOG.md`](../packages/mcp-server/CHANGELOG.md))
  with the queued summaries, including PR links via
  `@changesets/changelog-github`.
- Runs `scripts/sync-versions.mjs`, which propagates the new
  `@brighty-app/mcp-server` version to `.mcp.json`,
  `.claude-plugin/plugin.json`, the `SERVER_VERSION` constant in
  `src/index.ts`, the root `package.json`, and the `version` field
  in every `skills/*/SKILL.md` frontmatter.
- Deletes the consumed `.changeset/*.md` files.

Review the PR, edit if needed, then merge.

### When the version PR merges (no changesets pending, bumped versions on master)

The same workflow runs again on the merge commit. This time,
`changesets/action` sees no pending changesets but a fresh version
on a package, so it executes `yarn release`:

1. `yarn build` — builds every workspace package topologically
   (today that's just `packages/mcp-server`; future packages get
   built automatically without changing this script).
2. `changeset publish` — for each package whose version changed and
   isn't `private: true`, calls `npm publish --provenance --access
public`. Provenance attestation is generated via the
   `id-token: write` permission and the trusted-publisher config on
   npmjs.com.
3. Creates a git tag per published package — e.g.
   `@brighty-app/mcp-server@0.0.2` — and a matching GitHub Release
   with that package's `CHANGELOG.md` section as the release notes.

That's the release. Merging the version PR is the entire ceremony —
no `git tag` step, no `npm publish` from a laptop. The npm package
appears on npmjs.com with the green provenance badge a few seconds
later.

## What the sync script does

`scripts/sync-versions.mjs` reads the new version from
`packages/mcp-server/package.json` (which `changeset version` just
bumped) and writes it into:

- `.mcp.json` — the `@brighty-app/mcp-server@x.y.z` pin in the
  `npx -y -p ...` args.
- `.claude-plugin/plugin.json` — the `version` field on the plugin
  manifest.
- `package.json` (root) — the `version` field on the meta-toolkit
  package.
- `packages/mcp-server/src/index.ts` — the `SERVER_VERSION` constant
  the MCP server reports to the client at handshake time.
- `skills/*/SKILL.md` — the `metadata.version` field in each skill's
  frontmatter.

Idempotent — re-running on an already-aligned tree is a no-op. Run
it manually with `node scripts/sync-versions.mjs` if you ever want
to force a re-sync (e.g. after a manual edit drift).

## Skipping a changeset on purpose

If you're certain a PR shouldn't bump anything, add an empty
changeset:

```sh
yarn changeset --empty
```

This commits a `.changeset/<name>.md` file with no `release` line.
The action treats it as "this PR was considered for release and
explicitly opted out." Don't use this just because you forgot — only
when the PR genuinely doesn't change the package.

## Common questions

**Q: Do I need a changeset for skill content changes?**
Yes, when the skill's behaviour visibly changes for the agent (new
tool reference, new workflow, removed step). For typo fixes and
formatting, an empty changeset is fine.

**Q: What about breaking changes mid-`0.x`?**
Use a minor bump and put the word "BREAKING" at the start of the
summary. We graduate to semver majors at `1.0.0`.

**Q: Can I cut a hotfix without going through a changeset PR?**
Yes — you'd skip the changesets path and `npm publish` from a clean
checkout manually, the same way the very first `0.0.1` was published.
That's the emergency path; for everything else, the changesets
workflow is faster and produces a real CHANGELOG entry.

**Q: What if the sync-versions step gets out of sync?**
Run `node scripts/sync-versions.mjs` manually. It reads
`packages/mcp-server/package.json` as the source of truth and
propagates from there. Open a separate PR if the drift is large.

**Q: Can the same workflow really do both "open version PR" and
"publish on merge"?**
Yes — `changesets/action@v1` switches modes based on whether
`.changeset/*.md` files exist. With files, it opens the PR. Without
files (i.e. they were just consumed by a merged version PR), it
runs `yarn release`. One workflow, both behaviours.
