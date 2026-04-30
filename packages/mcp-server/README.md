# @brighty-app/mcp-server

TypeScript MCP server exposing the Brighty banking API as 24 tools (accounts, members, transfers, payouts, cards) over stdio.

This package is part of the [`brighty-agent-toolkit`](https://github.com/razz-team/brighty-agent-toolkit) monorepo. See the root README for installation, authentication, and usage.

## Bins

- `brighty-mcp` — start the stdio MCP server.
- `brighty-mcp-login` — interactive CLI that validates an API key against `GET /me` and stores it in the OS keychain.
- `brighty-mcp login` — alias for `brighty-mcp-login` when only the main bin is on `PATH`.

## Configuration

- `BRIGHTY_API_KEY` (env, preferred) or OS keychain entry `brighty-mcp / default`.
- `BRIGHTY_API_URL` — overrides the API base URL (default: `https://api.brighty.app`).
- `BRIGHTY_SKIP_AUTH_CHECK=1` — bypass the startup `GET /me` validation (debug / inspector only).

## License

MIT
