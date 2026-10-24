import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    existing: null as { id: string; plan: string; slot_interval_minutes?: number } | null,
    writes: [] as string[],
    insertError: null as { code?: string; message: string } | null,
    currentTimezone: "America/Sao_Paulo",
  },
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
        single: async () => ({ data: { timezone: state.currentTimezone } }),
        update: () => {
          state.writes.push(`update:${table}`);
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
        insert: async () => {
          state.writes.push(`insert:${table}`);
          return { error: state.insertError };
        },
        upsert: async () => {
          state.writes.push(`upsert:${table}`);
          return { error: null };
        },
      };
      return chain;
    },
  }),
}));

import { createBusiness, updateBusiness } from "./actions";

const INITIAL = { ok: true as const, data: undefined };
const EXISTING = { id: "business-1", plan: "free" };

function form(slug: string, timezone = "America/Sao_Paulo", slotIntervalMinutes = "30") {
  const fd = new FormData();
  fd.set("name", "Barbearia Demo");
  fd.set("slug", slug);
  fd.set("phone", "+5511999999999");
  fd.set("slotIntervalMinutes", slotIntervalMinutes);
  fd.set("minNoticeMinutes", "120");
  fd.set("bookingWindowDays", "30");
  fd.set("timezone", timezone);
  return fd;
}

beforeEach(() => {
  state.existing = null;
  state.writes = [];
  state.insertError = null;
  state.currentTimezone = "America/Sao_Paulo";
});

// #189: phones are always Brazilian, so a fuso abroad would leave the negócio
// unable to save and its clientes unable to book.
describe("fuso outside Brazil", () => {
  it.each([
    ["creating (onboarding)", createBusiness, null],
    ["editing (configurações)", updateBusiness, EXISTING],
  ])("rejects Europe/Lisbon when %s", async (_label, action, existing) => {
    state.existing = existing;
    const result = await action(INITIAL, form("barbearia-demo", "Europe/Lisbon"));
    expect(result).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { timezone: ["Escolha um fuso horário do Brasil."] },
    });
    expect(state.writes).toEqual([]);
  });

  it("accepts a Brazilian fuso outside the dashboard's list", async () => {
    const result = await createBusiness(INITIAL, form("barbearia-demo", "America/Fortaleza"));
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("keeps saving a negócio whose fuso was set abroad before the restriction", async () => {
    state.existing = EXISTING;
    state.currentTimezone = "America/New_York";
    const result = await updateBusiness(INITIAL, form("barbearia-demo", "America/New_York"));
    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.writes).toEqual(["update:businesses"]);
  });
});

// #191: intervals outside the fixed list made the public page list hundreds of horários.
describe("slot interval outside the list", () => {
  it.each([
    ["creating (onboarding)", createBusiness, null],
    ["editing (configurações)", updateBusiness, EXISTING],
  ])("rejects 1 minute when %s", async (_label, action, existing) => {
    state.existing = existing;
    const result = await action(INITIAL, form("barbearia-demo", "America/Sao_Paulo", "1"));
    expect(result).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { slotIntervalMinutes: ["Escolha um dos intervalos da lista."] },
    });
    expect(state.writes).toEqual([]);
  });

  it("keeps saving a negócio whose interval was set before the list", async () => {
    state.existing = { ...EXISTING, slot_interval_minutes: 25 };
    const result = await updateBusiness(INITIAL, form("barbearia-demo", "America/Sao_Paulo", "25"));
    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.writes).toEqual(["update:businesses"]);
  });

  it("does not let that negócio move to another interval outside the list", async () => {
    state.existing = { ...EXISTING, slot_interval_minutes: 25 };
    const result = await updateBusiness(INITIAL, form("barbearia-demo", "America/Sao_Paulo", "7"));
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(state.writes).toEqual([]);
  });
});

describe("reserved slugs", () => {
  it.each([
    ["creating (onboarding)", createBusiness, null],
    ["editing (configurações)", updateBusiness, EXISTING],
  ])("rejects a reserved slug when %s", async (_label, action, existing) => {
    state.existing = existing;
    const result = await action(INITIAL, form("recuperar-senha"));
    expect(result).toMatchObject({
      ok: false,
      code: "SLUG_RESERVED",
      message: expect.stringContaining("Este endereço está reservado"),
    });
    expect(state.writes).toEqual([]);
  });
});

describe("createBusiness", () => {
  it("creates the business for a new owner", async () => {
    const result = await createBusiness(INITIAL, form("barbearia-demo"));
    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.writes).toEqual(["upsert:profiles", "insert:businesses"]);
  });

  it("refuses without writing anything when the owner already has a business", async () => {
    state.existing = EXISTING;
    const result = await createBusiness(INITIAL, form("outro-negocio-beta"));
    expect(result).toMatchObject({ ok: false, code: "BUSINESS_EXISTS" });
    expect(state.writes).toEqual([]);
  });

  it("refuses when a concurrent setup created the business first", async () => {
    state.insertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "businesses_owner_id_key"',
    };
    const result = await createBusiness(INITIAL, form("barbearia-demo"));
    expect(result).toMatchObject({ ok: false, code: "BUSINESS_EXISTS" });
  });

  it("still reports a taken slug", async () => {
    state.insertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "businesses_slug_key"',
    };
    const result = await createBusiness(INITIAL, form("barbearia-demo"));
    expect(result).toMatchObject({
      ok: false,
      code: "SLUG_TAKEN",
      fieldErrors: { slug: ["Este endereço já está em uso. Escolha outro."] },
    });
  });
});

describe("updateBusiness", () => {
  it("updates the existing business", async () => {
    state.existing = EXISTING;
    const result = await updateBusiness(INITIAL, form("barbearia-demo"));
    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.writes).toEqual(["update:businesses"]);
  });

  it("never creates a business", async () => {
    const result = await updateBusiness(INITIAL, form("barbearia-demo"));
    expect(result).toMatchObject({ ok: false, code: "BUSINESS_NOT_FOUND" });
    expect(state.writes).toEqual([]);
  });
});
