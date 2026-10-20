import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    inserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    existing: [] as { id: string; name: string }[],
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/business/queries", () => ({ getCurrentBusiness: async () => ({ id: "business-1" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: state.existing, error: null }) }),
      insert: async (row: Record<string, unknown>) => {
        state.inserts.push(row);
        return { error: null };
      },
      update: (row: Record<string, unknown>) => {
        state.updates.push(row);
        const chain = { eq: () => chain, select: async () => ({ data: [row], error: null }) };
        return chain;
      },
    }),
  }),
}));

import { createService, updateService } from "./actions";

function serviceForm(price: string, durationMinutes = "30", name = "Corte") {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("description", "");
  fd.set("durationMinutes", durationMinutes);
  fd.set("price", price);
  return fd;
}

beforeEach(() => {
  state.inserts = [];
  state.updates = [];
  state.existing = [];
});

describe("createService price", () => {

  it.each(["49,90", "49.90"])("stores %s as 4990 centavos", async (price) => {
    const result = await createService({ ok: true, data: undefined }, serviceForm(price));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.inserts).toEqual([expect.objectContaining({ price_cents: 4990 })]);
  });

  it("rejects an invalid price with a pt-BR field error", async () => {
    const result = await createService({ ok: true, data: undefined }, serviceForm("49,901"));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION", fieldErrors: { priceCents: ["Informe um preço válido."] } });
    expect(state.inserts).toEqual([]);
  });

  // #128: 99999999 estourava o integer do banco e virava um erro genérico.
  it("rejects a price above the limit on the price field", async () => {
    const result = await createService({ ok: true, data: undefined }, serviceForm("99999999"));

    expect(result).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { priceCents: ["O preço máximo é R$ 100.000,00."] },
    });
    expect(state.inserts).toEqual([]);
  });

  it("explains an out-of-range duration in pt-BR", async () => {
    const result = await createService({ ok: true, data: undefined }, serviceForm("49,90", "0"));

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { durationMinutes: ["Informe uma duração entre 5 e 480 minutos."] },
    });
  });
});

// #128: dois serviços "Corte" apareciam iguais no select da página pública.
describe("service name uniqueness", () => {
  it("refuses a new serviço whose name another one already uses", async () => {
    state.existing = [{ id: "svc-1", name: "Corte" }];

    const result = await createService({ ok: true, data: undefined }, serviceForm("49,90", "30", "  corte "));

    expect(result).toMatchObject({ ok: false, code: "DUPLICATE_NAME", fieldErrors: { name: [expect.any(String)] } });
    expect(state.inserts).toEqual([]);
  });

  it("lets a serviço keep its own name when edited", async () => {
    state.existing = [{ id: "svc-1", name: "Corte" }];
    const fd = serviceForm("59,90");
    fd.set("id", "svc-1");

    const result = await updateService({ ok: true, data: undefined }, fd);

    expect(result).toEqual({ ok: true, data: undefined });
    expect(state.updates).toEqual([expect.objectContaining({ name: "Corte", price_cents: 5990 })]);
  });

  it("refuses renaming a serviço to another one's name", async () => {
    state.existing = [
      { id: "svc-1", name: "Corte" },
      { id: "svc-2", name: "Barba" },
    ];
    const fd = serviceForm("49,90", "30", "Barba");
    fd.set("id", "svc-1");

    const result = await updateService({ ok: true, data: undefined }, fd);

    expect(result).toMatchObject({ ok: false, code: "DUPLICATE_NAME" });
    expect(state.updates).toEqual([]);
  });
});
