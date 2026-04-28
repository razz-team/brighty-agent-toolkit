#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";

import { BrightyApiError, BrightyClient, type FetchLike } from "./api/client.js";
import { MissingApiKeyError, getApiKey, maskApiKey } from "./auth.js";
import { accountsTools } from "./tools/accounts/index.js";
import { cardsTools } from "./tools/cards/index.js";
import { membersTools } from "./tools/members/index.js";
import { payoutsTools } from "./tools/payouts/index.js";
import type { BrightyTool } from "./tools/tool.js";
import { transfersTools } from "./tools/transfers/index.js";

const SERVER_NAME = "brighty-mcp-server";
const SERVER_VERSION = "0.1.0";

export const ALL_TOOLS: BrightyTool[] = [
  ...accountsTools,
  ...membersTools,
  ...transfersTools,
  ...payoutsTools,
  ...cardsTools,
];

export function registerAllTools(server: McpServer): void {
  // Use `registerTool` (config-object form) instead of `tool(name, desc, shape, cb)`.
  // The legacy `tool(...)` overload only accepts a raw shape and rewraps it
  // via `objectFromShape`, which produces a default-strip ZodObject — so any
  // `.strict()` on the original schema would be dropped, and unknown keys
  // (e.g. a caller-supplied `idempotencyKey` on order-card / transfer-own,
  // where retries are unsafe) would be silently stripped instead of rejected.
  // Passing the full schema preserves its unknown-keys mode end-to-end.
  for (const tool of ALL_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      tool.handler,
    );
  }
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  registerAllTools(server);
  return server;
}

export interface StartupAuthOptions {
  fetch?: FetchLike;
  log?: (msg: string) => void;
}

export async function validateStartupAuth(opts: StartupAuthOptions = {}): Promise<void> {
  const log = opts.log ?? ((msg) => console.error(msg));
  const apiKey = await getApiKey();
  const masked = maskApiKey(apiKey);
  const client = new BrightyClient({
    apiKey,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
  try {
    await client.get("/me");
    log(`[brighty-mcp] auth OK (key ${masked})`);
  } catch (err) {
    if (err instanceof BrightyApiError && err.status === 401) {
      throw new Error(
        `Brighty API rejected the API key (key ${masked}, HTTP 401). ` +
          "Set a current BRIGHTY_API_KEY or refresh the keychain entry via the login CLI: " +
          "`yarn login` (local checkout), `brighty-mcp login` (after a global install), " +
          "or `npx -y -p @brighty/mcp-server brighty-mcp login` (no install).",
        { cause: err },
      );
    }
    throw err;
  }
}

export async function runStdio(): Promise<void> {
  // Validate auth before opening the transport so users see actionable
  // errors on stderr immediately rather than per-tool 401s. Set
  // BRIGHTY_SKIP_AUTH_CHECK=1 to bypass (e.g. piping through MCP Inspector
  // against a mocked Brighty API).
  if (process.env.BRIGHTY_SKIP_AUTH_CHECK !== "1") {
    try {
      await validateStartupAuth();
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        console.error(`[brighty-mcp] ${err.message}`);
      } else if (err instanceof Error) {
        console.error(`[brighty-mcp] startup auth failed: ${err.message}`);
      } else {
        console.error("[brighty-mcp] startup auth failed:", err);
      }
      process.exit(1);
    }
  }
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runCli(argv: readonly string[]): Promise<void> {
  // `brighty-mcp login` is a convenience alias for the standalone
  // `brighty-mcp-login` bin so users with one entry on PATH can still reach
  // the keychain flow. Anything else (no subcommand, or any token we don't
  // own) falls through to the stdio MCP server.
  if (argv[0] === "login") {
    const { runLogin } = await import("./cli/login.js");
    const result = await runLogin();
    process.exit(result.ok ? 0 : 1);
  }
  await runStdio();
}

const invokedAsMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsMain) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error("[brighty-mcp] fatal:", err);
    process.exit(1);
  });
}
