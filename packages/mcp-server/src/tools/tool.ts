import type { CallToolResult as SdkCallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

import type { BrightyClient } from "../api/client.js";
import { getClient } from "../api/client.js";

// Re-export the SDK's CallToolResult so handlers stay type-compatible with
// `server.tool(...)` registration without a cast at the boundary.
export type CallToolResult = SdkCallToolResult;

export type ToolExecute<TShape extends z.ZodRawShape, TResult> = (
  client: BrightyClient,
  args: z.infer<z.ZodObject<TShape>>,
) => Promise<TResult>;

export interface BrightyToolDefinition<TShape extends z.ZodRawShape, TResult> {
  name: string;
  description: string;
  inputSchema: z.ZodObject<TShape>;
  execute: ToolExecute<TShape, TResult>;
  formatResult?: (result: TResult) => CallToolResult;
}

// Erased view used at registration sites. handler/execute take `any` so
// heterogeneous tool definitions (each with their own zod shape) can live in
// a single `BrightyTool[]`. The MCP SDK validates inbound args via the zod
// shape before invoking the handler, so the runtime contract still holds.
// `extra` is the SDK's RequestHandlerExtra; we don't read from it but the
// SDK passes it as the second arg, so the signature must accept it.
export interface BrightyTool {
  name: string;
  description: string;
  inputSchema: z.AnyZodObject;
  handler: (args: any, extra?: unknown) => Promise<CallToolResult>;
  execute: (client: BrightyClient, args: any) => Promise<unknown>;
  formatResult: (result: any) => CallToolResult;
}

export function asTextResult<T>(result: T): CallToolResult {
  const text =
    result === undefined
      ? ""
      : typeof result === "string"
        ? result
        : JSON.stringify(result, null, 2);
  return { content: [{ type: "text", text }] };
}

export function defineBrightyTool<TShape extends z.ZodRawShape, TResult>(
  def: BrightyToolDefinition<TShape, TResult>,
): BrightyTool {
  const formatResult = def.formatResult ?? asTextResult;
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    execute: def.execute as (client: BrightyClient, args: any) => Promise<unknown>,
    formatResult: formatResult as (result: any) => CallToolResult,
    handler: async (args) => {
      const client = await getClient();
      const result = await def.execute(client, args);
      return formatResult(result);
    },
  };
}
