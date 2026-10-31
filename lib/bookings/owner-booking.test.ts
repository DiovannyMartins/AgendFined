import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

const { state, sendBookingConfirmationEmail, syncGoogleCalendarBooking } = vi.hoisted(() => ({
  state: {
    business: null as Record<string, unknown> | null,
    singles: {} as Record<string, unknown>,
    lists: {} as Record<string, unknown[]>,
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
    rpcResult: null as RpcResult | null,
  },
  sendBookingConfirmationEmail: vi.fn<(input: unknown) => Promise<SendResult>>(async () => ({ sent: true })),
  syncGoogleCalendarBooking: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => import("@/tests/mocks/rate-limit-admin"));
vi.mock("@/lib/email/booking-confirmation", () => ({ sendBookingConfirmationEmail }));
vi.mock("@/lib/google-calendar/sync", () => ({ syncGoogleCalendarBooking }));
vi.mock("@/lib/app-origin", () => ({ resolveAppOrigin: () => new URL("https://agendfined.test") }));
vi.mock("@/lib/business/queries", () => ({ getCurrentBusiness: async () => state.business }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        lt: () => query,
        gt: () => query,
        neq: () => query,
        maybeSingle: async () => ({ data: state.singles[table] ?? null, error: null }),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: state.lists[table] ?? [], error: null }).then(resolve),
      };
      return query;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return state.rpcResult ?? { data: createdBooking(args), error: null };
    },
  }),
}));

import { createOwnerBooking, getOwnerSlots } from "./owner-booking";
import { OWNER_EMAIL_RATE_LIMIT } from "@/lib/booking/rate-limit";
import { rateLimitAdmin } from "@/tests/mocks/rate-limit-admin";
import { flushAfterResponse } from "@/tests/mocks/after-response";

// 09:10 em São Paulo, sábado 24/10/2026.
const NOW = new Date("2026-10-24T12:10:00.000Z");
// Segunda-feira 26/10/2026: weekday 2 (1 = domingo).
const MONDAY = "2026-10-26";

function createdBooking(args: Record<string, unknown>) {
  return {
    id: "booking-1",
    business_id: "business-1",
    public_code: "AB12CD34",
    start_at: args.p_start_at,
    customer_name_snapshot: args.p_customer_name,
    customer_phone_snapshot: args.p_customer_phone,
    customer_email_snapshot: args.p_customer_email ?? null,
    service_name_snapshot: "Corte",
  };
}

function bookingForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const fields = {
    serviceId: "7f9c2a52-5f43-4d8e-9a3c-1b2d3e4f5a6b",
    date: MONDAY,
    startTime: "10:00",
    customerName: "Bruna Lima",
    customerPhone: "(11) 98888-7777",
    customerEmail: "",
    customerNote: "",
    ...overrides,
  };
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

const create = (formData: FormData) => createOwnerBooking({ ok: true }, formData);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  state.business = {
    id: "business-1",
    owner_id: "owner-1",
    name: "Barbearia Demo",
    slug: "barbearia-demo",
    phone: "11987654321",
    timezone: "America/Sao_Paulo",
    plan: "free",
    slot_interval_minutes: 60,
    min_notice_minutes: 120,
    booking_window_days: 60,
  };
  state.singles = { services: { id: "7f9c2a52-5f43-4d8e-9a3c-1b2d3e4f5a6b", duration_minutes: 60, is_active: true } };
  state.lists = { availability: [{ weekday: 2, start_time: "09:00:00", end_time: "18:00:00" }] };
  state.rpcCalls = [];
  state.rpcResult = null;
  rateLimitAdmin.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("createOwnerBooking (#193)", () => {
  it("cria a reserva sem e-mail e devolve o link privado para o WhatsApp", async () => {
    const result = await create(bookingForm());

    expect(state.rpcCalls).toHaveLength(1);
    const [{ name, args }] = state.rpcCalls;
    expect(name).toBe("create_owner_booking");
    expect(args).toMatchObject({
      p_start_at: "2026-10-26T13:00:00.000Z",
      p_customer_name: "Bruna Lima",
      p_customer_phone: "11988887777",
      p_customer_email: undefined,
    });
    expect(args.p_cancel_token_hash).toMatch(/^[0-9a-f]{64}$/);

    expect(result).toMatchObject({ ok: true, publicCode: "AB12CD34", agendaDate: MONDAY });
    expect(result.confirmationUrl).toMatch(
      /^https:\/\/agendfined\.test\/barbearia-demo\/confirmacao\?code=AB12CD34#cancel=[A-Za-z0-9_-]+$/,
    );
    // Only the digest goes to the database (ADR 0005).
    expect(result.confirmationUrl).not.toContain(String(args.p_cancel_token_hash));
    expect(result.message).toContain("WhatsApp");
    expect(sendBookingConfirmationEmail).not.toHaveBeenCalled();
    // #217: Google is synced after the response.
    expect(syncGoogleCalendarBooking).not.toHaveBeenCalled();
    await flushAfterResponse();
    expect(syncGoogleCalendarBooking).toHaveBeenCalledWith("business-1", "booking-1");
  });

  it("envia a confirmação quando o dono informa o e-mail do cliente", async () => {
    const result = await create(bookingForm({ customerEmail: "bruna@example.com" }));

    expect(sendBookingConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: "bruna@example.com",
        publicCode: "AB12CD34",
        confirmationUrl: result.confirmationUrl,
      }),
    );
    expect(result.message).toBe("Confirmação enviada por e-mail para bruna@example.com.");
  });

  it("avisa quando o e-mail não sai, sem desfazer a reserva", async () => {
    sendBookingConfirmationEmail.mockResolvedValueOnce({ sent: false, reason: "provider_error" });

    const result = await create(bookingForm({ customerEmail: "bruna@example.com" }));

    expect(result.ok).toBe(true);
    expect(result.confirmationUrl).toBeTruthy();
    expect(result.message).toContain("Não foi possível enviar o e-mail");
  });

  it("acima do limite diário do endereço, cria a reserva sem enviar a ele e pede o WhatsApp", async () => {
    const { limit } = OWNER_EMAIL_RATE_LIMIT.perRecipientDaily;
    for (let sent = 0; sent < limit; sent += 1) {
      await create(bookingForm({ customerEmail: "bruna@example.com" }));
    }
    expect(sendBookingConfirmationEmail).toHaveBeenCalledTimes(limit);

    const sameAddress = await create(bookingForm({ customerEmail: "Bruna@Example.com" }));
    expect(sendBookingConfirmationEmail).toHaveBeenCalledTimes(limit);
    expect(sameAddress).toMatchObject({ ok: true, message: "Não foi possível enviar o e-mail. Envie o link da confirmação pelo WhatsApp." });

    await create(bookingForm({ customerEmail: "outra@example.com" }));
    expect(sendBookingConfirmationEmail).toHaveBeenCalledTimes(limit + 1);
  });

  it("acima do orçamento de e-mails do negócio, cria a reserva sem enviar e pede o WhatsApp", async () => {
    const { limit } = OWNER_EMAIL_RATE_LIMIT.perOwnerHourly;
    for (let sent = 0; sent < limit; sent += 1) {
      await create(bookingForm({ customerEmail: `cliente${sent}@example.com` }));
    }
    expect(sendBookingConfirmationEmail).toHaveBeenCalledTimes(limit);
    state.rpcCalls = [];

    const result = await create(bookingForm({ customerEmail: "bruna@example.com" }));

    expect(state.rpcCalls.map(({ name }) => name)).toEqual(["create_owner_booking"]);
    expect(sendBookingConfirmationEmail).toHaveBeenCalledTimes(limit);
    expect(result).toMatchObject({ ok: true, publicCode: "AB12CD34" });
    expect(result.confirmationUrl).toBeTruthy();
    expect(result.message).toBe("Não foi possível enviar o e-mail. Envie o link da confirmação pelo WhatsApp.");
  });

  it("sem o contador de e-mails, cria a reserva e não envia", async () => {
    rateLimitAdmin.failing = true;

    const result = await create(bookingForm({ customerEmail: "bruna@example.com" }));

    expect(result).toMatchObject({ ok: true, publicCode: "AB12CD34" });
    expect(sendBookingConfirmationEmail).not.toHaveBeenCalled();
    expect(result.message).toContain("WhatsApp");
  });

  it("ignora a antecedência do cliente", async () => {
    state.lists = { availability: [{ weekday: 7, start_time: "09:00:00", end_time: "18:00:00" }] };

    // 1h50 from now, inside the 120-minute antecedência of the public page.
    const result = await create(bookingForm({ date: "2026-10-24", startTime: "11:00" }));

    expect(result).toMatchObject({ ok: true });
    expect(state.rpcCalls[0].args.p_start_at).toBe("2026-10-24T14:00:00.000Z");
  });

  it("aceita uma data além da janela configurada, dentro do limite do plano", async () => {
    state.business = { ...state.business, booking_window_days: 7 };

    const result = await create(bookingForm({ date: "2026-12-14" }));

    expect(result.ok).toBe(true);
  });

  it("recusa uma data além do limite do plano sem chamar o banco", async () => {
    const result = await create(bookingForm({ date: "2027-02-01" }));

    expect(result).toMatchObject({ ok: false, code: "booking_window" });
    expect(result.message).toContain("90 dias");
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("recusa horário que já passou", async () => {
    const result = await create(bookingForm({ date: "2026-10-24", startTime: "09:00" }));

    expect(result).toMatchObject({ ok: false, code: "past" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("pede confirmação de encaixe fora da disponibilidade", async () => {
    const result = await create(bookingForm({ startTime: "17:30" }));

    // 17:30 + 60 min ends after the 18:00 faixa.
    expect(result).toMatchObject({ ok: false, code: "outside_availability" });
    expect(state.rpcCalls).toHaveLength(0);

    const encaixe = bookingForm({ startTime: "17:30" });
    encaixe.set("encaixe", "on");
    expect(await create(encaixe)).toMatchObject({ ok: true });
    expect(state.rpcCalls).toHaveLength(1);
  });

  it("aponta os campos inválidos com mensagens sobre o cliente", async () => {
    const result = await create(bookingForm({ customerName: "", customerPhone: "", customerEmail: "bruna@" }));

    expect(result.code).toBe("validation");
    expect(result.fieldErrors?.customerName).toEqual(["Informe o nome do cliente."]);
    expect(result.fieldErrors?.customerPhone).toEqual(["Informe o telefone do cliente."]);
    expect(result.fieldErrors?.customerEmail).toEqual(["Informe um e-mail válido."]);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("recusa serviço inativo", async () => {
    state.singles = { services: { id: "x", duration_minutes: 60, is_active: false } };

    expect(await create(bookingForm())).toMatchObject({ ok: false, code: "service_not_found" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("traduz o bloqueio e a sobreposição garantidos pelo banco", async () => {
    state.rpcResult = { data: null, error: { message: "BOOKING_BLOCK_OVERLAP" } };
    expect(await create(bookingForm())).toMatchObject({ ok: false, code: "blocked" });

    state.rpcResult = {
      data: null,
      error: { code: "23P01", message: 'conflicting key value violates exclusion constraint "bookings_no_overlap"' },
    };
    expect(await create(bookingForm())).toMatchObject({ ok: false, code: "slot_taken" });
  });

  it("exige um negócio", async () => {
    state.business = null;

    expect(await create(bookingForm())).toMatchObject({ ok: false, code: "no_business" });
  });
});

describe("getOwnerSlots (#193)", () => {
  beforeEach(() => {
    state.lists = {
      availability: [{ start_time: "09:00:00", end_time: "12:00:00" }],
      availability_blocks: [],
      bookings: [],
    };
  });

  it("mostra os horários de hoje sem a antecedência do cliente", async () => {
    const result = await getOwnerSlots("7f9c2a52-5f43-4d8e-9a3c-1b2d3e4f5a6b", "2026-10-24");

    expect(result).toEqual({ available: ["10:00", "11:00"] });
  });

  it("tira os horários ocupados", async () => {
    state.lists.bookings = [{ start_at: "2026-10-24T13:00:00.000Z", end_at: "2026-10-24T14:00:00.000Z" }];

    const result = await getOwnerSlots("7f9c2a52-5f43-4d8e-9a3c-1b2d3e4f5a6b", "2026-10-24");

    expect(result).toEqual({ available: ["11:00"] });
  });

  it("valida a entrada", async () => {
    expect(await getOwnerSlots("x", "2026-10-24")).toEqual({ available: [], error: "validation" });
  });
});
