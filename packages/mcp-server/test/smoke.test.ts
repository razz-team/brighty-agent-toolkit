import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { ALL_TOOLS, createServer, registerAllTools } from "../src/index.js";

const EXPECTED_TOOL_COUNT = 24;

describe("mcp-server registration", () => {
  it("createServer returns an instance without throwing", () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it("registerAllTools refuses to double-register on the same server", () => {
    // createServer already calls registerAllTools once; a second call must
    // throw because the SDK forbids registering the same name twice. This
    // pins the contract so a future refactor that silently swallows the
    // duplicate (e.g. via a guard) can't slip through.
    const server = createServer();
    expect(() => registerAllTools(server)).toThrow();
  });

  it(`exposes exactly ${EXPECTED_TOOL_COUNT} tools, all brighty_-prefixed and unique`, () => {
    expect(ALL_TOOLS).toHaveLength(EXPECTED_TOOL_COUNT);
    const names = ALL_TOOLS.map((t) => t.name);
    for (const n of names) {
      expect(n).toMatch(/^brighty_[a-z0-9_]+$/);
    }
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("mcp-server integration: tools/list", () => {
  it(`returns exactly ${EXPECTED_TOOL_COUNT} tools over the MCP protocol`, async () => {
    // We use InMemoryTransport instead of spawning a real stdio child:
    // the test stays hermetic (no build, no native keytar load, no env-var
    // dance) while still exercising the full request-routing protocol that
    // a real client would. Real stdio is verified manually with
    // `mcp inspector` per docs/SECURITY.md.
    const server = createServer();
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(EXPECTED_TOOL_COUNT);

      const expected = ALL_TOOLS.map((t) => t.name).toSorted();
      const actual = tools.map((t) => t.name).toSorted();
      expect(actual).toEqual(expected);

      for (const t of tools) {
        expect(t.name).toMatch(/^brighty_/);
        expect(t.description).toBeTruthy();
        expect(t.inputSchema.type).toBe("object");
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects unknown args (e.g. caller-supplied idempotencyKey) on tools whose schema is .strict()", async () => {
    // End-to-end guard: registerAllTools must hand the full Zod schema to
    // the SDK, not just `.shape`. A shape-only path would let the SDK
    // re-wrap into a default-strip object and silently drop unknown keys,
    // re-introducing the order-card / transfer-own replay bug.
    const server = createServer();
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const result = await client.callTool({
        name: "brighty_order_card",
        arguments: {
          kind: "VIRTUAL",
          accountId: "acc_eur",
          idempotencyKey: "client-supplied-uuid",
        },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
      expect(text).toMatch(/idempotencyKey|unrecognized|Input validation/i);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
