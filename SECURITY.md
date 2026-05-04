# Security policy

Report vulnerabilities to **security@brighty.app**, not via public
GitHub issues.

The threat model and credential handling for the stdio MCP server are
documented in [`docs/SECURITY.md`](./docs/SECURITY.md). Notable
load-bearing invariants:

- No MCP tool takes a credential as an argument (`brighty_setup` is
  intentionally absent).
- The server reads `BRIGHTY_API_KEY` from the environment first, then
  the OS keychain (`brighty-mcp` / `default` via `@napi-rs/keyring`),
  and exits with an actionable error if neither is set.
- Startup auth-check (`GET /business/v1/accounts`) runs before the
  stdio transport opens; bypass via `BRIGHTY_SKIP_AUTH_CHECK=1` is for
  development only.
- The server is stdio-only. Do not run it behind a public HTTP
  endpoint — the toolkit assumes one operator, one key, one local
  machine.

If you find a regression that violates any of those, treat it as a
security issue and report via the email above.
