import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { owned: null as { id: string } | null, membership: null as { business_id: string; role: "admin" | "editor" | "user" } | null },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => ({
      select: () => ({
        eq: (column: string) => ({
          maybeSingle: async () => ({
            data: table === "business_memberships" ? state.membership
              : column === "owner_id" ? state.owned
                : { id: "business-1" },
          }),
        }),
      }),
    }),
  }),
}));

import { getCurrentBusiness } from "./queries";

describe("business role guard", () => {
  beforeEach(() => { state.owned = null; state.membership = null; });

  it("keeps the existing owner an admin", async () => {
    state.owned = { id: "business-1" };
    expect((await getCurrentBusiness("admin"))?.id).toBe("business-1");
  });

  it("lets an editor read but denies admin actions", async () => {
    state.membership = { business_id: "business-1", role: "editor" };
    expect((await getCurrentBusiness("user"))?.id).toBe("business-1");
    expect(await getCurrentBusiness("admin")).toBeNull();
  });

  it("denies writes to a read-only member", async () => {
    state.membership = { business_id: "business-1", role: "user" };
    expect(await getCurrentBusiness("editor")).toBeNull();
  });
});
