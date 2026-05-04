# Working with changesets

This repo uses [Changesets](https://github.com/changesets/changesets)
to track version bumps and `CHANGELOG.md` entries for the publishable
package (`@brighty-app/mcp-server`). The actual `npm publish` is
handled by `release-mcp.yml` on tag push — changesets owns the
"what's the next version and what changed" half, the release workflow
owns the "actually publish with provenance" half.

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
     changed default behaviour). Reserve this for `1.0.0` and
     beyond; while we're `0.x` use minor for breaks and call it out
     in the changeset summary.
3. Write a summary. This text lands in `CHANGELOG.md` and the GitHub
   release notes verbatim. Write it the way you want a future user
   to read it — what changed, why, what they need to do (if
   anything). One to three sentences is usually right. No "various
   improvements".

The CLI writes a markdown file to `.changeset/<random-name>.md`.
**Commit it with the rest of your PR.**

You can run `yarn changeset` multiple times in one PR if your work
spans multiple categories (e.g. one minor for a new tool plus one
patch for an unrelated fix).

## What happens after the PR merges

1. Push to `master` triggers `.github/workflows/changesets-release.yml`.
2. The `changesets/action` action either opens a new "**chore: version
   packages**" PR or appends to the existing one. The PR:
   - Bumps `packages/mcp-server/package.json` version per the queued
     changesets.
   - Updates `CHANGELOG.md` with the queued summaries.
   - Runs `scripts/sync-versions.mjs`, which propagates the new
     version to `.mcp.json`, `.claude-plugin/plugin.json`, the
     `SERVER_VERSION` constant in `src/index.ts`, the root
     `package.json`, and the `version` field in every
     `skills/*/SKILL.md` frontmatter.
   - Deletes the consumed `.changeset/*.md` files.
3. Review the PR. The diff is the version bumps, CHANGELOG, and a
   handful of one-line version updates from the sync script. If
   anything looks weird, edit the PR — you can also rewrite the
   CHANGELOG section.
4. Merge the version-packages PR.
5. The maintainer who merged it then runs locally:

   ```sh
   git fetch origin master && git checkout master && git pull
   PKG_VERSION=$(node -p "require('./packages/mcp-server/package.json').version")
   git tag "mcp-server-v${PKG_VERSION}"
   git push origin "mcp-server-v${PKG_VERSION}"
   ```

   The tag push triggers `release-mcp.yml` which does the actual
   `npm publish --provenance --access public` and creates a GitHub
   Release with notes from the `CHANGELOG.md` section.

This last manual step exists on purpose: the maintainer is
explicitly attesting "I'm comfortable cutting this release". It's a
single command and you can wrap it in a script if you want.

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
summary so it stands out in the CHANGELOG. We graduate to semver
majors at `1.0.0`.

**Q: Can I tag without merging the version PR?**
Don't. The workflow expects the version-packages PR to land first,
because that's what produces the version bump and CHANGELOG entry
that the release notes will be drawn from.

**Q: What if the sync-versions step gets out of sync?**
Run `node scripts/sync-versions.mjs` manually. It reads
`packages/mcp-server/package.json` as the source of truth and
propagates from there. Open a separate PR if the drift is large.
