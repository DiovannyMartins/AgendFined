import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { user: { id: "user-1" } as { id: string } | null, owned: null as { id: string } | null, tables: [] as string[] },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      state.tables.push(table);
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.owned }) }) }) };
    },
  }),
}));

import { getCurrentBusiness } from "./queries";

describe("business owner access", () => {
  beforeEach(() => { state.user = { id: "user-1" }; state.owned = null; state.tables = []; });

  it("returns the owner's business", async () => {
    state.owned = { id: "business-1" };
    expect((await getCurrentBusiness())?.id).toBe("business-1");
    expect(state.tables).toEqual(["businesses"]);
  });

  it("returns no business to another authenticated user", async () => {
    expect(await getCurrentBusiness()).toBeNull();
    expect(state.tables).toEqual(["businesses"]);
  });

  it("does not query businesses without a session", async () => {
    state.user = null;
    expect(await getCurrentBusiness()).toBeNull();
    expect(state.tables).toEqual([]);
  });
});
