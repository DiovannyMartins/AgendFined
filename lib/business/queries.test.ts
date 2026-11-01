import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    user: { id: "user-1" } as { id: string } | null,
    owned: null as { id: string } | null,
    tables: [] as string[],
    access: { data: true as boolean | null, error: null as { message: string } | null },
    rpcs: [] as Array<{ fn: string; args: unknown }>,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      state.tables.push(table);
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.owned }) }) }) };
    },
    rpc: async (fn: string, args: unknown) => {
      state.rpcs.push({ fn, args });
      return state.access;
    },
  }),
}));

import { getCurrentBusiness } from "./queries";

describe("business owner access", () => {
  beforeEach(() => {
    state.user = { id: "user-1" };
    state.owned = null;
    state.tables = [];
    state.rpcs = [];
    state.access = { data: true, error: null };
  });

  it("returns the owner's business with its access (ADR 0013)", async () => {
    state.owned = { id: "business-1" };
    const business = await getCurrentBusiness();
    expect(business?.id).toBe("business-1");
    expect(business?.has_access).toBe(true);
    expect(state.tables).toEqual(["businesses"]);
    expect(state.rpcs).toEqual([{ fn: "business_has_access", args: { p_business_id: "business-1" } }]);
  });

  it("marks a negócio without access as suspended", async () => {
    state.owned = { id: "business-1" };
    state.access = { data: false, error: null };
    expect((await getCurrentBusiness())?.has_access).toBe(false);
  });

  it("fails closed when the access lookup fails", async () => {
    state.owned = { id: "business-1" };
    state.access = { data: null, error: { message: "boom" } };
    expect((await getCurrentBusiness())?.has_access).toBe(false);
  });

  it("returns no business to another authenticated user", async () => {
    expect(await getCurrentBusiness()).toBeNull();
    expect(state.tables).toEqual(["businesses"]);
    expect(state.rpcs).toEqual([]);
  });

  it("does not query businesses without a session", async () => {
    state.user = null;
    expect(await getCurrentBusiness()).toBeNull();
    expect(state.tables).toEqual([]);
  });
});
