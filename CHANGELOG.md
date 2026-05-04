# Changelog

This is a Yarn 4 monorepo. Per-package changelogs live next to each
package, managed by [Changesets](https://github.com/changesets/changesets):

- [`packages/mcp-server/CHANGELOG.md`](./packages/mcp-server/CHANGELOG.md) —
  the published `@brighty-app/mcp-server` package.

Skills (`skills/brighty-*`) are versioned via their `metadata.version`
frontmatter, kept in sync with `@brighty-app/mcp-server` by
`scripts/sync-versions.mjs` so the toolkit ships as a coherent set.
