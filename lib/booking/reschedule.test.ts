import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

const { state, mocks } = vi.hoisted(() => ({
  state: {
    singles: {} as Record<string, unknown>,
    lists: {} as Record<string, unknown[]>,
    eqs: [] as [string, unknown][],
    neqs: [] as [string, unknown][],
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
    rpcResult: null as RpcResult | null,
    allowed: true,
    businessAllowed: true,
    // Counters of check_booking_rate_limit, by key, as the RPC keeps them.
    counters: new Map<string, number>(),
  },
  mocks: {
    sendCustomerRescheduledEmail: vi.fn(async () => ({ sent: true as const })),
    notifyOwner: vi.fn(async () => {}),
    syncGoogleCalendarBooking: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/email/booking-reschedule", () => ({ sendCustomerRescheduledEmail: mocks.sendCustomerRescheduledEmail }));
vi.mock("@/lib/bookings/owner-notification", () => ({ notifyOwner: mocks.notifyOwner }));
vi.mock("@/lib/google-calendar/sync", () => ({ syncGoogleCalendarBooking: mocks.syncGoogleCalendarBooking }));
vi.mock("@/lib/app-origin", () => ({ resolveAppOrigin: () => new URL("https://agendfined.test") }));
vi.mock("@/lib/booking/rate-limit", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/booking/rate-limit")>()),
  getClientIp: async () => "203.0.113.7",
  enforceConsultRateLimit: async () => state.allowed,
  enforceAvailabilityIpRateLimit: async () => state.allowed,
  enforceAvailabilityBusinessRateLimit: async () => state.businessAllowed,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          state.eqs.push([column, value]);
          return query;
        },
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
      if (name === "check_booking_rate_limit") {
        const key = String(args.p_key);
        const count = (state.counters.get(key) ?? 0) + 1;
        state.counters.set(key, count);
        return { data: count <= Number(args.p_limit), error: null };
      }
      state.rpcCalls.push({ name, args });
      return state.rpcResult ?? { data: moved(args), error: null };
    },
  }),
}));

import { getPublicRescheduleSlots, reschedulePublicBooking } from "./reschedule";
import { hashCancelToken } from "@/lib/bookings/cancel";
import { flushAfterResponse } from "@/tests/mocks/after-response";
import { PUBLIC_CAPABILITY_RATE_LIMIT, RATE_LIMIT } from "@/lib/booking/rate-limit";

// 09:10 em São Paulo, sábado 24/10/2026.
const NOW = new Date("2026-10-24T12:10:00.000Z");
// Segunda-feira 26/10/2026: weekday 2 (1 = domingo).
const MONDAY = "2026-10-26";
const TOKEN = "A".repeat(43);
const CODE = "AB12CD34";

const booking = (overrides: Record<string, unknown> = {}) => ({
  id: "booking-1",
  business_id: "business-1",
  status: "confirmed",
  start_at: "2026-10-26T13:00:00.000Z",
  duration_minutes_snapshot: 60,
  ...overrides,
});

function moved(args: Record<string, unknown>) {
  return {
    ...booking(),
    start_at: args.p_start_at,
    public_code: CODE,
    customer_name_snapshot: "Bruna Lima",
    customer_phone_snapshot: "11988887777",
    customer_email_snapshot: "bruna@example.com",
    service_name_snapshot: "Corte",
  };
}

function form(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const fields = { code: CODE, token: TOKEN, date: MONDAY, startTime: "15:00", ...overrides };
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

const reschedule = (formData: FormData) => reschedulePublicBooking({ status: "idle" }, formData);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  state.singles = {
    bookings: booking(),
    businesses: {
      id: "business-1",
      is_active: true,
      slot_interval_minutes: 60,
      min_notice_minutes: 120,
      booking_window_days: 30,
      plan: "free",
      timezone: "America/Sao_Paulo",
      name: "Barbearia Demo",
      slug: "barbearia-demo",
      owner_id: "owner-1",
      phone: "11987654321",
    },
  };
  state.lists = { availability: [{ start_time: "09:00:00", end_time: "18:00:00" }] };
  state.eqs = [];
  state.neqs = [];
  state.rpcCalls = [];
  state.rpcResult = null;
  state.allowed = true;
  state.businessAllowed = true;
  state.counters = new Map();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("reschedulePublicBooking (#194)", () => {
  it("move a própria reserva com o token e avisa o cliente e o dono", async () => {
    const result = await reschedule(form());

    expect(result).toEqual({ status: "done", startAt: "2026-10-26T18:00:00.000Z" });
    expect(state.eqs).toContainEqual(["cancel_token_hash", hashCancelToken(TOKEN)]);
    expect(state.rpcCalls).toEqual([
      {
        name: "reschedule_booking_by_public_code",
        args: { p_code: CODE, p_cancel_token_hash: hashCancelToken(TOKEN), p_start_at: "2026-10-26T18:00:00.000Z" },
      },
    ]);
    // #217: the response awaits only the cliente's e-mail.
    expect(mocks.syncGoogleCalendarBooking).not.toHaveBeenCalled();
    expect(mocks.notifyOwner).not.toHaveBeenCalled();
    await flushAfterResponse();
    expect(mocks.syncGoogleCalendarBooking).toHaveBeenCalledWith("business-1", "booking-1");
    expect(mocks.sendCustomerRescheduledEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        previousStartAt: "2026-10-26T13:00:00.000Z",
        startAt: "2026-10-26T18:00:00.000Z",
        bookingUrl: "https://agendfined.test/barbearia-demo/confirmacao?code=AB12CD34",
      }),
    );
    expect(mocks.notifyOwner).toHaveBeenCalledWith(
      expect.anything(),
      "customer_rescheduled",
      expect.objectContaining({ ownerId: "owner-1", previousStartAt: "2026-10-26T13:00:00.000Z" }),
    );
  });

  it("aceita um horário dentro do intervalo atual da própria reserva", async () => {
    // The reserva itself (10:00–11:00) is left out of the occupied horários.
    state.lists.bookings = [];
    expect((await reschedule(form({ startTime: "11:00" }))).status).toBe("done");
    expect(state.neqs).toContainEqual(["id", "booking-1"]);
  });

  it("recusa token inválido ou que não aponta para uma reserva, sem dizer qual parte falhou", async () => {
    expect((await reschedule(form({ token: "curto" }))).status).toBe("error");

    state.singles.bookings = null;
    const result = await reschedule(form());
    expect(result).toMatchObject({ status: "error", code: "INVALID_TOKEN" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("recusa reserva cancelada e reserva que já começou", async () => {
    state.singles.bookings = booking({ status: "cancelled" });
    expect(await reschedule(form())).toMatchObject({ code: "INVALID_TOKEN" });

    state.singles.bookings = booking({ start_at: "2026-10-24T12:00:00.000Z" });
    expect(await reschedule(form())).toMatchObject({ code: "ALREADY_STARTED" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("aplica a antecedência, a janela e as faixas da página pública", async () => {
    // Antecedência de 2 h: 10:00 de hoje (sábado sem faixa) e fora da janela de 30 dias.
    expect(await reschedule(form({ date: "2026-10-24", startTime: "10:00" }))).toMatchObject({ code: "SLOT_TAKEN" });
    expect(await reschedule(form({ date: "2026-12-07", startTime: "10:00" }))).toMatchObject({ code: "SLOT_TAKEN" });
    // 17:30 + 60 min passa da faixa.
    expect(await reschedule(form({ startTime: "17:30" }))).toMatchObject({ code: "SLOT_TAKEN" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("respeita o limite por IP", async () => {
    state.allowed = false;
    expect(await reschedule(form())).toMatchObject({ code: "RATE_LIMITED" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("recusa a remarcação além do limite diário da reserva, sem mover nem enviar e-mails", async () => {
    const { limit } = PUBLIC_CAPABILITY_RATE_LIMIT.reschedulesPerBooking;
    for (let move = 0; move < limit; move += 1) {
      expect((await reschedule(form())).status).toBe("done");
    }
    vi.clearAllMocks();
    state.rpcCalls = [];

    const result = await reschedule(form());

    expect(result).toMatchObject({ status: "error", code: "RESCHEDULE_LIMIT" });
    expect(state.rpcCalls).toHaveLength(0);
    expect(mocks.sendCustomerRescheduledEmail).not.toHaveBeenCalled();
    expect(mocks.notifyOwner).not.toHaveBeenCalled();
    // Counted per reserva: another reserva of the negócio still moves.
    state.singles.bookings = booking({ id: "booking-2" });
    expect((await reschedule(form())).status).toBe("done");
  });

  it("não gasta o limite da reserva com um horário recusado antes do banco", async () => {
    expect(await reschedule(form({ startTime: "17:30" }))).toMatchObject({ code: "SLOT_TAKEN" });
    expect(state.counters.get("booking:booking-1|public-reschedule")).toBeUndefined();
  });

  it("remarca sem enviar e-mails quando o negócio esgotou o orçamento dos fluxos públicos", async () => {
    state.counters.set(
      "business:business-1|public_capability_email|1h",
      PUBLIC_CAPABILITY_RATE_LIMIT.emailPerBusinessHourly.limit,
    );

    expect((await reschedule(form())).status).toBe("done");
    expect(mocks.sendCustomerRescheduledEmail).not.toHaveBeenCalled();
    expect(mocks.notifyOwner).not.toHaveBeenCalled();
  });

  it("gasta um e-mail do orçamento do negócio por envio e respeita o teto do destinatário", async () => {
    expect((await reschedule(form())).status).toBe("done");
    expect(state.counters.get("business:business-1|public_capability_email|1h")).toBe(2);
    await flushAfterResponse();

    for (const key of state.counters.keys()) {
      if (key.endsWith("|public-write")) state.counters.set(key, RATE_LIMIT.perRecipientEmail.limit);
    }
    vi.clearAllMocks();
    expect((await reschedule(form())).status).toBe("done");
    await flushAfterResponse();
    expect(mocks.sendCustomerRescheduledEmail).not.toHaveBeenCalled();
    expect(mocks.notifyOwner).toHaveBeenCalledTimes(1);
  });

  it("traduz os erros do banco", async () => {
    state.rpcResult = { data: null, error: { message: "conflicting", code: "23P01" } };
    expect(await reschedule(form())).toMatchObject({ code: "SLOT_TAKEN" });

    state.rpcResult = { data: null, error: { message: "SERVICE_INACTIVE" } };
    expect(await reschedule(form())).toMatchObject({ code: "SERVICE_INACTIVE" });

    state.rpcResult = { data: null, error: { message: "RESCHEDULE_REJECTED" } };
    expect(await reschedule(form())).toMatchObject({ code: "INVALID_TOKEN" });
  });
});

describe("getPublicRescheduleSlots (#194)", () => {
  it("lista os horários livres da página pública para a reserva do token", async () => {
    const result = await getPublicRescheduleSlots(CODE, TOKEN, MONDAY);

    expect(result.available).toContain("09:00");
    expect(result.available).toContain("17:00");
    expect(result.available).not.toContain("17:30");
    // The current horário (10:00) is not offered as a move.
    expect(result.available).not.toContain("10:00");
  });

  it("recusa sem um token válido e respeita o limite por IP", async () => {
    expect((await getPublicRescheduleSlots(CODE, "curto", MONDAY)).error).toBe("rejected");

    state.allowed = false;
    expect((await getPublicRescheduleSlots(CODE, TOKEN, MONDAY)).error).toBe("rate_limited");
  });

  // #219: a flood past the per-IP window never reaches the service-role lookup.
  it("cobra o limite por IP antes de consultar a reserva com service role", async () => {
    state.allowed = false;

    expect((await getPublicRescheduleSlots(CODE, TOKEN, MONDAY)).error).toBe("rate_limited");
    expect(state.eqs).toEqual([]);
  });

  it("respeita o limite por negócio depois de achar a reserva, sem ler a agenda", async () => {
    state.businessAllowed = false;

    expect((await getPublicRescheduleSlots(CODE, TOKEN, MONDAY)).error).toBe("rate_limited");
    expect(state.eqs.map(([column]) => column)).not.toContain("business_id");
  });
});
