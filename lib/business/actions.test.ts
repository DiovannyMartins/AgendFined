import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { existing: null as { id: string; plan: string } | null, writes: [] as string[] },
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gt: () => Promise.resolve({ count: 0 }),
        maybeSingle: async () => ({ data: state.existing }),
        single: async () => ({ data: { timezone: "America/Sao_Paulo" } }),
        update: () => {
          state.writes.push(`update:${table}`);
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
        insert: async () => {
          state.writes.push(`insert:${table}`);
          return { error: null };
        },
        upsert: async () => ({ error: null }),
      };
      return chain;
    },
  }),
}));

import { upsertBusiness } from "./actions";

function form(slug: string) {
  const fd = new FormData();
  fd.set("name", "Barbearia Demo");
  fd.set("slug", slug);
  fd.set("phone", "+5511999999999");
  fd.set("slotIntervalMinutes", "30");
  fd.set("minNoticeMinutes", "120");
  fd.set("bookingWindowDays", "30");
  fd.set("timezone", "America/Sao_Paulo");
  return fd;
}

describe("upsertBusiness reserved slugs", () => {
  beforeEach(() => {
    state.existing = null;
    state.writes = [];
  });

  it.each([
    ["creating (onboarding)", null],
    ["editing (configurações)", { id: "business-1", plan: "free" }],
  ])("rejects a reserved slug when %s", async (_label, existing) => {
    state.existing = existing;
    const result = await upsertBusiness({ ok: true, data: undefined }, form("recuperar-senha"));
    expect(result).toMatchObject({
      ok: false,
      code: "SLUG_RESERVED",
      message: expect.stringContaining("Este endereço está reservado"),
    });
    expect(state.writes).toEqual([]);
  });

  it("saves a regular slug", async () => {
    const result = await upsertBusiness({ ok: true, data: undefined }, form("barbearia-demo"));
    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.writes).toEqual(["insert:businesses"]);
  });
});
