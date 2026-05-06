# Working with changesets

This repo uses [Changesets](https://github.com/changesets/changesets)
to track version bumps, `CHANGELOG.md` entries, and the actual `npm
publish` for `@brighty-app/mcp-server`. One workflow drives the whole
release: no manual `git tag`, no separate publish step.

For the operator who just wants to cut a release, jump to
[Cutting a release](#cutting-a-release-step-by-step). The sections
above it cover the contributor-side workflow (when and how to add a
changeset).

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

## One-time npm setup (trusted publisher)

Before the workflow can publish with provenance, register it as a
trusted publisher on npmjs.com. This is a once-per-package step.

On [`npmjs.com/package/@brighty-app/mcp-server`](https://www.npmjs.com/package/@brighty-app/mcp-server)
→ **Settings → Trusted Publisher → Add GitHub Actions**:

| Field                | Value                    |
| -------------------- | ------------------------ |
| Organization or user | `razz-team`              |
| Repository           | `brighty-agent-toolkit`  |
| Workflow filename    | `changesets-release.yml` |
| Environment          | _(leave empty)_          |

Without this, `npm publish --provenance` fails with `unauthorized` and
the publish step on the workflow goes red even though everything else
is green. The check happens via OIDC at publish time — there's no npm
token stored in repo secrets, and there shouldn't be.

If you ever rename the workflow file, update the trusted-publisher
entry to match. The match is exact, on filename only (not path).

## Cutting a release: step-by-step

This is what the human operator does end-to-end to cut a release.
Assumes a queued changeset exists on a feature branch (`yarn changeset`
already run, file committed).

### 1. Land the changeset on master

Open a PR from your feature branch to master, get it reviewed, merge.
Any merge style works — see [Merge style](#merge-style-squash-merge-rebase)
below. The point is that the `.changeset/*.md` file lands on master.

### 2. Wait for the version PR

The push to master triggers `changesets-release.yml` in **«open
version PR»** mode. Within a minute it opens (or updates) a PR titled
`chore: version packages` that:

- Bumps `packages/mcp-server/package.json` (e.g. `0.0.1` → `0.0.2`).
- Runs `scripts/sync-versions.mjs` — propagates the new version into
  `.mcp.json`, `.claude-plugin/plugin.json`, the `SERVER_VERSION`
  constant, and every `SKILL.md` frontmatter.
- Updates `packages/mcp-server/CHANGELOG.md` with the queued summary.
- Deletes the consumed `.changeset/*.md` files.

Track it:

```sh
gh run list --workflow=changesets-release.yml --limit=3
gh pr list --search "version packages in:title"
```

### 3. Review the version PR

```sh
gh pr diff <pr-number>
```

Spot check:

- Version on `packages/mcp-server/package.json` matches what you
  expected from the bump kind on the changeset.
- `CHANGELOG.md` got the changeset summary verbatim.
- `.mcp.json` and `.claude-plugin/plugin.json` are aligned to the new
  version (proof that `sync-versions.mjs` ran).
- No leftover `.changeset/*.md` for the changesets that were just
  consumed.

The version PR is a regular branch — if you want to tweak the
changelog wording or add a forgotten note, push to its head. The
workflow will re-run and update the PR in place.

### 4. Merge the version PR

Any merge style works. Squashing is **not** required — the version PR
typically already has a single `chore: version packages` commit, so
squash, merge-commit, and rebase are functionally identical for this
PR. See [Merge style](#merge-style-squash-merge-rebase).

### 5. Wait for the publish run

The merge triggers `changesets-release.yml` again, this time in
**«publish»** mode (no pending changesets, but a fresh version on a
package). It runs:

1. `yarn install --immutable`
2. `yarn release` → `yarn build` (topological) → `changeset publish`
3. `changeset publish` calls `npm publish --provenance --access public`
   for each non-private package whose version changed.
4. Creates a git tag `@brighty-app/mcp-server@<version>` and a
   matching GitHub Release with the changelog entry as release notes.

```sh
gh run watch
```

### 6. Verify the published artifact

```sh
# Package exists with the right version
npm view @brighty-app/mcp-server@<version> version dist.tarball

# Provenance attestation is attached
npm view @brighty-app/mcp-server@<version> --json | jq '.dist.attestations'

# Git tag and GitHub Release landed
git fetch --tags
git tag -l '@brighty-app/mcp-server@<version>'
gh release view '@brighty-app/mcp-server@<version>'
```

The package page on npmjs.com should show a green "Provenance" badge
within a minute or two.

Smoke test that the published artifact actually runs:

```sh
BRIGHTY_API_KEY=<key> npx -y -p @brighty-app/mcp-server@<version> brighty-mcp
# Should start and listen on stdin (Ctrl+C to exit).
```

## Merge style: squash, merge, rebase

All three work. None of them are required.

The workflow triggers on `push` to master and reads the working tree
state, not the commit graph — so it doesn't care whether master got
your changes via a squash commit, a merge commit, or a fast-forward
rebase. The only thing that matters is that the resulting tree has
your `.changeset/*.md` (for opening a version PR) or your bumped
`package.json` (for publishing).

For the **version PR specifically**: the PR almost always contains a
single `chore: version packages` commit (the `commit:` field in the
workflow), so the three styles produce identical-looking master
history. Pick whichever your repo norm is.

For **feature PRs that include changesets**: same story functionally.
The only practical difference is git-log hygiene — squash gives you
one commit per PR on master, merge gives you the full PR commits plus
a merge commit, rebase gives you the full PR commits linearly.

## Recovering from a failed publish

| Symptom                                         | What happened                                                                            | Fix                                                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn release` fails on build                   | Version PR merged, but publish never happened. No tag, no GitHub Release, npm unchanged. | Fix the build issue on master. Re-run the workflow: `gh workflow run changesets-release.yml --ref master`. With no pending changesets it goes straight to publish mode.                       |
| `npm publish` returns `unauthorized`            | Trusted Publisher not set up, or `workflow filename` doesn't match.                      | See [One-time npm setup](#one-time-npm-setup-trusted-publisher). The filename check is exact — `changesets-release.yml`, no path prefix.                                                      |
| Provenance badge missing on a published version | `id-token: write` permission absent, or `NPM_CONFIG_PROVENANCE` got overridden.          | Both are set in `.github/workflows/changesets-release.yml` — verify nothing in the repo or org settings is dropping them. Bump a patch and republish; you can't add provenance retroactively. |
| Tag created but `npm publish` silently failed   | Rare — usually means the tarball was uploaded but the registry rejected it.              | npm refuses re-publish of the same version for 72 hours. Don't try to force-republish. Bump the next patch (`yarn changeset` → new file → `0.0.3`) and run the flow again.                    |
| Version PR opened with the wrong bump           | Changeset said `patch` but the change is breaking.                                       | Edit the changeset file on the feature branch (or open a follow-up PR that adjusts), close the version PR, re-trigger. Or merge as-is and add a corrective changeset on top.                  |

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
Yes, as an emergency path: open a small PR with the fix and a
changeset on top, merge it, then merge the resulting version PR
immediately. End-to-end this is usually under 10 minutes. Manual
`npm publish` from a laptop is also possible but bypasses provenance
and the CHANGELOG entry — avoid it unless the workflow itself is
broken.

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
