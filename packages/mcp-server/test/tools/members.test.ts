import { describe, expect, it, vi } from "vitest";

import { type BrightyClient } from "../../src/api/client.js";
import { addMembers } from "../../src/tools/members/add-members.js";
import { listMembers } from "../../src/tools/members/list-members.js";
import { removeMembers } from "../../src/tools/members/remove-members.js";
import { membersTools } from "../../src/tools/members/index.js";
import type { Member } from "../../src/types/brighty.js";

type ClientMethods = "get" | "post" | "put" | "patch" | "delete" | "request";

function makeClient(overrides: Partial<Record<ClientMethods, unknown>> = {}): {
  client: BrightyClient;
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn();
  const post = vi.fn();
  const stub = {
    get: overrides.get ?? get,
    post: overrides.post ?? post,
    put: overrides.put ?? vi.fn(),
    patch: overrides.patch ?? vi.fn(),
    delete: overrides.delete ?? vi.fn(),
    request: overrides.request ?? vi.fn(),
    getBaseUrl: () => "https://api.brighty.app",
  };
  return {
    client: stub as unknown as BrightyClient,
    get: stub.get as ReturnType<typeof vi.fn>,
    post: stub.post as ReturnType<typeof vi.fn>,
  };
}

describe("members/index barrel", () => {
  it("exports three members tools with brighty_-prefixed snake_case names", () => {
    expect(membersTools).toHaveLength(3);
    const names = membersTools.map((t) => t.name).toSorted();
    expect(names).toEqual([
      "brighty_add_members",
      "brighty_list_members",
      "brighty_remove_members",
    ]);
    for (const t of membersTools) {
      expect(t.name).toMatch(/^brighty_[a-z_]+$/);
      expect(typeof t.handler).toBe("function");
    }
  });
});

describe("brighty_list_members", () => {
  it("forwards optional filters as query parameters", async () => {
    const members: Member[] = [
      {
        id: "m1",
        email: "alice@example.com",
        role: "ADMIN",
        status: "ACTIVE",
      },
    ];
    const { client, get } = makeClient();
    get.mockResolvedValueOnce(members);

    const result = await listMembers.execute(client, {
      status: "ACTIVE",
      role: "ADMIN",
    });

    expect(result).toEqual(members);
    expect(get).toHaveBeenCalledWith("/members", {
      query: { status: "ACTIVE", role: "ADMIN" },
    });
  });
});

describe("brighty_add_members", () => {
  it("POSTs to /members with the invitations array", async () => {
    const created: Member[] = [
      {
        id: "m_new1",
        email: "bob@example.com",
        role: "EMPLOYEE",
        status: "INVITED",
      },
      {
        id: "m_new2",
        email: "carol@example.com",
        role: "ACCOUNTANT",
        status: "INVITED",
      },
    ];
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(created);

    const invitations = [
      { email: "bob@example.com", role: "EMPLOYEE" as const },
      {
        email: "carol@example.com",
        role: "ACCOUNTANT" as const,
        name: "Carol",
      },
    ];

    const result = await addMembers.execute(client, { invitations });

    expect(result).toEqual(created);
    expect(post).toHaveBeenCalledWith("/members", {
      body: { invitations },
    });
  });

  it("rejects an empty invitations array at parse time", () => {
    expect(() => addMembers.inputSchema.parse({ invitations: [] })).toThrow();
  });

  it("rejects an invitation with a malformed email at parse time", () => {
    expect(() =>
      addMembers.inputSchema.parse({
        invitations: [{ email: "not-an-email", role: "EMPLOYEE" }],
      }),
    ).toThrow();
  });

  it("rejects an invitation with an unknown role at parse time", () => {
    expect(() =>
      addMembers.inputSchema.parse({
        invitations: [{ email: "x@y.z", role: "INTERN" }],
      }),
    ).toThrow();
  });
});

describe("brighty_remove_members", () => {
  it("POSTs to /members/remove and returns a removal summary", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(undefined);

    const result = await removeMembers.execute(client, {
      memberIds: ["m1", "m2"],
    });

    expect(result).toEqual({ removed: ["m1", "m2"], count: 2 });
    expect(post).toHaveBeenCalledWith("/members/remove", {
      body: { memberIds: ["m1", "m2"] },
    });
  });

  it("rejects an empty memberIds array at parse time", () => {
    expect(() => removeMembers.inputSchema.parse({ memberIds: [] })).toThrow();
  });
});
