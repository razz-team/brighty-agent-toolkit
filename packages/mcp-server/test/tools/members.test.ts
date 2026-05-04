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
    getBaseUrl: () => "https://api.brighty.app/business/v1",
  };
  return {
    client: stub as unknown as BrightyClient,
    get: stub.get as ReturnType<typeof vi.fn>,
    post: stub.post as ReturnType<typeof vi.fn>,
  };
}

function fixtureMember(overrides: Partial<Member> = {}): Member {
  return {
    membership: { memberId: "m1", role: "ADMIN", state: "ACTIVE" },
    ...overrides,
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
  it("forwards withTerminated as a query parameter and unwraps the {members} envelope", async () => {
    const members = [fixtureMember()];
    const { client, get } = makeClient();
    get.mockResolvedValueOnce({ members });

    const result = await listMembers.execute(client, { withTerminated: true });

    expect(result).toEqual(members);
    expect(get).toHaveBeenCalledWith("/members", {
      query: { withTerminated: true },
    });
  });

  it("works with no filters (empty input)", async () => {
    const { client, get } = makeClient();
    get.mockResolvedValueOnce({ members: [] });

    const parsed = listMembers.inputSchema.parse({});
    const result = await listMembers.execute(client, parsed);

    expect(result).toEqual([]);
    const [path, opts] = get.mock.calls[0]!;
    expect(path).toBe("/members");
    expect(opts).toEqual({
      query: { withTerminated: undefined },
    });
  });
});

describe("brighty_add_members", () => {
  it("POSTs to /members wrapped as { members: [...] } and forwards the array verbatim", async () => {
    const created = [
      { memberId: "m_new1", role: "MEMBER" as const, state: "INVITED" },
      { memberId: "m_new2", role: "ADMIN" as const, state: "INVITED" },
    ];
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(created);

    const members = [
      { email: "bob@example.com", role: "MEMBER" as const },
      {
        email: "carol@example.com",
        role: "ADMIN" as const,
        legalName: { firstName: "Carol", lastName: "Doe" },
        nationality: "CH",
      },
    ];

    const result = await addMembers.execute(client, { members });

    expect(result).toEqual(created);
    expect(post).toHaveBeenCalledWith("/members", {
      body: { members },
    });
  });

  it("rejects an empty members array at parse time", () => {
    expect(() => addMembers.inputSchema.parse({ members: [] })).toThrow();
  });

  it("rejects an invitation with a malformed email at parse time", () => {
    expect(() =>
      addMembers.inputSchema.parse({
        members: [{ email: "not-an-email", role: "MEMBER" }],
      }),
    ).toThrow();
  });

  it("rejects an invitation with an unknown role at parse time", () => {
    expect(() =>
      addMembers.inputSchema.parse({
        members: [{ email: "x@y.z", role: "INTERN" }],
      }),
    ).toThrow();
  });

  it("accepts the full role enum (MEMBER | VIEWER | PAYER | ADMIN | OWNER)", () => {
    for (const role of ["MEMBER", "VIEWER", "PAYER", "ADMIN", "OWNER"] as const) {
      const result = addMembers.inputSchema.safeParse({
        members: [{ email: "person@example.com", role }],
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("brighty_remove_members", () => {
  it("POSTs to /members/remove with members array (UUIDs) and returns a removal summary", async () => {
    const { client, post } = makeClient();
    post.mockResolvedValueOnce(undefined);

    const result = await removeMembers.execute(client, {
      memberIds: ["m1", "m2"],
    });

    expect(result).toEqual({ removed: ["m1", "m2"], count: 2 });
    expect(post).toHaveBeenCalledWith("/members/remove", {
      body: { members: ["m1", "m2"] },
    });
  });

  it("rejects an empty memberIds array at parse time", () => {
    expect(() => removeMembers.inputSchema.parse({ memberIds: [] })).toThrow();
  });
});
