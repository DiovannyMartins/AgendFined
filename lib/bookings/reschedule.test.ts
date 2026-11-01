import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

const { state, sendBusinessRescheduledEmail, syncGoogleCalendarBooking } = vi.hoisted(() => ({
  state: {
    business: null as Record<string, unknown> | null,
    singles: {} as Record<string, unknown>,
    lists: {} as Record<string, unknown[]>,
    neqs: [] as [string, unknown][],
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
    rpcResult: null as RpcResult | null,
  },
  sendBusinessRescheduledEmail: vi.fn<(input: unknown) => Promise<SendResult>>(async () => ({ sent: true })),
  syncGoogleCalendarBooking: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => import("@/tests/mocks/rate-limit-admin"));
vi.mock("@/lib/email/booking-reschedule", () => ({ sendBusinessRescheduledEmail }));
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
        neq: (column: string, value: unknown) => {
          state.neqs.push([column, value]);
          return query;
        },
        maybeSingle: async () => ({ data: state.singles[table] ?? null, error: null }),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: state.lists[table] ?? [], error: null }).then(resolve),
      };
      return query;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return state.rpcResult ?? { data: movedBooking(args), error: null };
    },
  }),
}));

import { getOwnerRescheduleSlots, rescheduleOwnerBooking } from "./reschedule";
import { OWNER_EMAIL_RATE_LIMIT } from "@/lib/booking/rate-limit";
import { rateLimitAdmin } from "@/tests/mocks/rate-limit-admin";
import { flushAfterResponse } from "@/tests/mocks/after-response";

// 09:10 em São Paulo, sábado 24/10/2026.
const NOW = new Date("2026-10-24T12:10:00.000Z");
// Segunda-feira 26/10/2026: weekday 2 (1 = domingo).
const MONDAY = "2026-10-26";
const BOOKING_ID = "2b7c1d4e-8f9a-4b3c-9d2e-1f0a2b3c4d5e";

const currentBooking = (overrides: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  status: "confirmed",
  start_at: "2026-10-26T13:00:00.000Z",
  duration_minutes_snapshot: 60,
  public_code: "AB12CD34",
  customer_name_snapshot: "Bruna Lima",
  customer_email_snapshot: "bruna@example.com",
  service_name_snapshot: "Corte",
  ...overrides,
});

function movedBooking(args: Record<string, unknown>) {
  const booking = currentBooking(state.singles.bookings as Record<string, unknown>);
  return { ...booking, business_id: "business-1", customer_phone_snapshot: "11988887777", start_at: args.p_start_at };
}

function form(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const fields = { bookingId: BOOKING_ID, date: MONDAY, startTime: "15:00", ...overrides };
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

const reschedule = (formData: FormData) => rescheduleOwnerBooking({ ok: true }, formData);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  state.business = {
    id: "business-1",
    owner_id: "owner-1",
    name: "Barbearia Demo",
    slug: "barbearia-demo",
    phone: "11987654321",
    timezone: "America/Sao_Paulo",
    has_access: true,
    slot_interval_minutes: 60,
    min_notice_minutes: 120,
    booking_window_days: 60,
  };
  state.singles = { bookings: currentBooking() };
  state.lists = { availability: [{ weekday: 2, start_time: "09:00:00", end_time: "18:00:00" }] };
  state.neqs = [];
  state.rpcCalls = [];
  state.rpcResult = null;
  rateLimitAdmin.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("rescheduleOwnerBooking (#194)", () => {
  it("move a reserva, sincroniza o Google Calendar e avisa o cliente por e-mail", async () => {
    const result = await reschedule(form());

    expect(state.rpcCalls).toEqual([
      { name: "reschedule_owner_booking", args: { p_booking_id: BOOKING_ID, p_start_at: "2026-10-26T18:00:00.000Z" } },
    ]);
    // #217: Google is synced after the response.
    expect(syncGoogleCalendarBooking).not.toHaveBeenCalled();
    await flushAfterResponse();
    expect(syncGoogleCalendarBooking).toHaveBeenCalledWith("business-1", BOOKING_ID);
    expect(sendBusinessRescheduledEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: "bruna@example.com",
        previousStartAt: "2026-10-26T13:00:00.000Z",
        startAt: "2026-10-26T18:00:00.000Z",
        publicCode: "AB12CD34",
        bookingUrl: "https://agendfined.test/barbearia-demo/confirmacao?code=AB12CD34",
      }),
    );
    expect(result).toMatchObject({ ok: true, agendaDate: MONDAY, startAt: "2026-10-26T18:00:00.000Z" });
    expect(result.notifyByWhatsApp).toBeUndefined();
  });

  it("sem e-mail do cliente, pede para avisar pelo WhatsApp", async () => {
    state.singles.bookings = currentBooking({ customer_email_snapshot: null });

    const result = await reschedule(form());

    expect(sendBusinessRescheduledEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, notifyByWhatsApp: true, customerPhone: "11988887777" });
  });

  it("avisa quando o e-mail não sai, sem desfazer a remarcação", async () => {
    sendBusinessRescheduledEmail.mockResolvedValueOnce({ sent: false, reason: "provider_error" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await reschedule(form());

    expect(result).toMatchObject({ ok: true, notifyByWhatsApp: true });
    expect(result.message).toContain("o e-mail não saiu");
  });

  it("acima do orçamento de e-mails do negócio, remarca sem enviar e pede o WhatsApp", async () => {
    const { limit } = OWNER_EMAIL_RATE_LIMIT.perOwnerHourly;
    rateLimitAdmin.counts.set("owner:owner-1|owner_email|1h", limit);

    const result = await reschedule(form());

    expect(state.rpcCalls.map(({ name }) => name)).toEqual(["reschedule_owner_booking"]);
    expect(sendBusinessRescheduledEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      startAt: "2026-10-26T18:00:00.000Z",
      notifyByWhatsApp: true,
      message: "Reserva remarcada, mas o e-mail não saiu. Avise o novo horário pelo WhatsApp.",
    });
  });

  it("sem o contador de e-mails, remarca e não envia", async () => {
    rateLimitAdmin.failing = true;

    const result = await reschedule(form());

    expect(sendBusinessRescheduledEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, notifyByWhatsApp: true });
  });

  it("recusa reserva que não está confirmada ou que já começou, sem chamar o banco", async () => {
    state.singles.bookings = currentBooking({ status: "cancelled" });
    expect((await reschedule(form())).code).toBe("not_reschedulable");

    state.singles.bookings = currentBooking({ start_at: "2026-10-24T12:00:00.000Z" });
    expect((await reschedule(form())).code).toBe("not_reschedulable");

    expect(state.rpcCalls).toHaveLength(0);
  });

  it("recusa o mesmo horário e horário que já passou", async () => {
    expect((await reschedule(form({ startTime: "10:00" }))).code).toBe("same_start");
    expect((await reschedule(form({ date: "2026-10-24", startTime: "08:00" }))).code).toBe("past");
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("aceita além da janela configurada, dentro do limite do plano, e recusa além dele", async () => {
    expect((await reschedule(form({ date: "2027-01-11", startTime: "10:00" }))).code).toBeUndefined();
    expect((await reschedule(form({ date: "2027-03-01", startTime: "10:00" }))).code).toBeUndefined();
    expect((await reschedule(form({ date: "2027-11-01", startTime: "10:00" }))).code).toBe("booking_window");
  });

  it("pede confirmação de encaixe fora da disponibilidade, com a duração do snapshot", async () => {
    // 17:30 + 60 min do snapshot passa das 18:00.
    const outside = await reschedule(form({ startTime: "17:30" }));
    expect(outside.code).toBe("outside_availability");
    expect(state.rpcCalls).toHaveLength(0);

    const encaixe = form({ startTime: "17:30" });
    encaixe.set("encaixe", "on");
    expect((await reschedule(encaixe)).ok).toBe(true);
  });

  it("traduz os erros garantidos pelo banco", async () => {
    state.rpcResult = { data: null, error: { message: "BOOKING_BLOCK_OVERLAP" } };
    expect((await reschedule(form())).code).toBe("blocked");

    state.rpcResult = { data: null, error: { message: "conflicting key value", code: "23P01" } };
    expect((await reschedule(form())).code).toBe("slot_taken");

    state.rpcResult = { data: null, error: { message: "BOOKING_ALREADY_STARTED" } };
    expect((await reschedule(form())).code).toBe("not_reschedulable");
  });

  it("valida a entrada e exige negócio e reserva", async () => {
    expect((await reschedule(form({ bookingId: "x" }))).code).toBe("validation");

    state.singles = {};
    expect((await reschedule(form())).code).toBe("not_found");

    state.business = null;
    expect((await reschedule(form())).code).toBe("no_business");
  });
});

describe("getOwnerRescheduleSlots (#194)", () => {
  it("lista os horários livres sem contar a própria reserva como ocupada nem oferecer o horário atual", async () => {
    state.lists.bookings = [];

    const result = await getOwnerRescheduleSlots(BOOKING_ID, MONDAY);

    expect(result.available).toContain("09:00");
    expect(result.available).toContain("11:00");
    expect(result.available).not.toContain("10:00");
    expect(result.available).toContain("17:00");
    expect(state.neqs).toContainEqual(["id", BOOKING_ID]);
  });

  it("valida a entrada", async () => {
    expect((await getOwnerRescheduleSlots("x", MONDAY)).error).toBe("validation");
  });
});
