import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    business: null as Record<string, unknown> | null,
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  },
}));

vi.mock("@/lib/booking/anti-bot", () => ({ verifyTurnstile: async () => ({ ok: true }) }));
vi.mock("@/lib/booking/rate-limit", () => ({
  getClientIp: async () => "203.0.113.7",
  enforceRateLimit: async () => true,
  enforceConsultRateLimit: async () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const query = {
      select: () => query,
      eq: () => query,
      single: async () => ({ data: state.business, error: null }),
    };
    return {
      from: () => query,
      rpc: async (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        return { data: "waitlist-entry-1", error: null };
      },
    };
  },
}));

import { consultBooking, createBooking, joinWaitlist } from "@/lib/booking/actions";

describe("consultBooking", () => {
  it("reports malformed codes before requiring anti-bot verification", async () => {
    const formData = new FormData();
    formData.set("code", "not-a-code");

    const result = await consultBooking({ status: "idle" }, formData);

    expect(result).toEqual({
      status: "error",
      code: "INVALID_CODE",
      message: "Informe um código de reserva válido.",
    });
  });
});

describe("createBooking", () => {
  const validInput = {
    slug: "barbearia",
    serviceId: "8f14e45f-ceea-467f-a8c8-2a1a0c6e3f4b",
    date: "2026-10-20",
    startTime: "09:00",
    customerName: "Maria Souza",
    customerPhone: "11987654321",
    customerEmail: "maria@example.com",
  };

  it("rejects a one-letter customer name with a pt-BR error on the name field", async () => {
    const result = await createBooking({ ...validInput, customerName: "A" });

    expect(result).toMatchObject({
      ok: false,
      code: "validation",
      message: "Revise os campos destacados.",
      fieldErrors: { customerName: ["Informe seu nome completo."] },
    });
  });

  it("reports every invalid customer field in pt-BR, never with Zod's English defaults", async () => {
    const result = await createBooking({
      ...validInput,
      customerName: undefined as unknown as string,
      customerPhone: "123",
      customerEmail: "maria",
      customerNote: "x".repeat(501),
    });

    expect(result.fieldErrors).toEqual({
      customerName: ["Revise este campo."],
      customerPhone: ["Informe um telefone com DDD."],
      customerEmail: ["Informe um e-mail válido."],
      customerNote: ["A observação não pode passar de 500 caracteres."],
    });
  });

  it("asks for the e-mail when it is left blank", async () => {
    const result = await createBooking({ ...validInput, customerEmail: "" });

    expect(result.fieldErrors).toEqual({ customerEmail: ["Informe seu e-mail."] });
  });

  it("rejects a phone made of letters", async () => {
    const result = await createBooking({ ...validInput, customerPhone: "abcdefgh" });

    expect(result.fieldErrors).toEqual({
      customerPhone: ["O telefone deve ter apenas números, como (11) 98888-7777."],
    });
  });
});

describe("joinWaitlist", () => {
  const validInput = {
    slug: "barbearia",
    serviceId: "8f14e45f-ceea-467f-a8c8-2a1a0c6e3f4b",
    date: "2026-10-20",
    startTime: "09:00",
    customerName: "Maria Souza",
    customerPhone: "11987654321",
  };

  it("rejects an invalid phone with a pt-BR error on the phone field", async () => {
    const result = await joinWaitlist({ ...validInput, customerPhone: "12345678" });

    expect(result).toEqual({
      ok: false,
      code: "validation",
      message: "Revise os campos destacados.",
      fieldErrors: { customerPhone: ["Informe um telefone com DDD."] },
    });
  });

  describe("plan gate", () => {
    const futureInput = { ...validInput, date: "2030-01-15" };
    const business = {
      id: "business-1",
      name: "Barbearia",
      slot_interval_minutes: 30,
      min_notice_minutes: 0,
      booking_window_days: 365,
      timezone: "America/Sao_Paulo",
    };

    beforeEach(() => {
      state.rpcCalls = [];
    });

    it("refuses a Grátis business without writing anything", async () => {
      state.business = { ...business, plan: "free" };

      const result = await joinWaitlist(futureInput);

      expect(result).toMatchObject({ ok: false, code: "waitlist_unavailable" });
      expect(result.message).not.toMatch(/plano|grátis|pro/i);
      expect(state.rpcCalls).toEqual([]);
    });

    it("fails closed when the business has no plan", async () => {
      state.business = { ...business, plan: null };

      const result = await joinWaitlist(futureInput);

      expect(result).toMatchObject({ ok: false, code: "waitlist_unavailable" });
      expect(state.rpcCalls).toEqual([]);
    });

    it("keeps adding PROFISSIONAL customers to the waitlist", async () => {
      state.business = { ...business, plan: "pro" };

      const result = await joinWaitlist(futureInput);

      expect(result).toEqual({ ok: true, message: "Você entrou na lista de espera deste horário." });
      expect(state.rpcCalls).toEqual([
        {
          name: "join_waitlist",
          args: expect.objectContaining({
            p_business_id: "business-1",
            p_service_id: validInput.serviceId,
            p_start_at: "2030-01-15T12:00:00.000Z",
          }),
        },
      ]);
    });
  });
});
