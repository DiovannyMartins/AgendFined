import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };
type RpcResult = { data: unknown; error: { message: string } | null };
type RecordedQuery = { table: string; filters: [string, unknown][]; update: Record<string, unknown> | null };

const { state, sendCustomerCancelledEmail } = vi.hoisted(() => ({
  state: {
    business: null as Record<string, unknown> | null,
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
    rpcResults: {} as Record<string, RpcResult>,
    queries: [] as RecordedQuery[],
  },
  sendCustomerCancelledEmail: vi.fn<(input: unknown) => Promise<SendResult>>(async () => ({ sent: true })),
}));

vi.mock("@/lib/booking/anti-bot", () => ({ verifyTurnstile: async () => ({ ok: true }) }));
vi.mock("@/lib/booking/rate-limit", () => ({
  getClientIp: async () => "203.0.113.7",
  enforceRateLimit: async () => true,
  enforceConsultRateLimit: async () => true,
}));
vi.mock("@/lib/bookings/classification", () => ({
  classifyCancellationReason: vi.fn(async () => null),
  classifyCustomerNote: vi.fn(async () => null),
  classifyOperationalError: vi.fn(async () => null),
}));
vi.mock("@/lib/google-calendar/sync", () => ({ syncGoogleCalendarBooking: vi.fn() }));
vi.mock("@/lib/email/booking-cancellation", () => ({ sendCustomerCancelledEmail }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const from = (table: string) => {
      const recorded: RecordedQuery = { table, filters: [], update: null };
      state.queries.push(recorded);
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => (recorded.filters.push([column, value]), query),
        update: (values: Record<string, unknown>) => ((recorded.update = values), query),
        single: async () => ({ data: state.business, error: null }),
        maybeSingle: async () => ({ data: state.business, error: null }),
        then: (resolve: (value: { data: null; error: null }) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return query;
    };
    return {
      from,
      rpc: async (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        return state.rpcResults[name] ?? { data: "waitlist-entry-1", error: null };
      },
    };
  },
}));

import { cancelPublicBooking, consultBooking, createBooking, joinWaitlist } from "@/lib/booking/actions";
import { classifyCancellationReason } from "@/lib/bookings/classification";
import { syncGoogleCalendarBooking } from "@/lib/google-calendar/sync";

describe("consultBooking", () => {
  it("reports malformed codes before requiring anti-bot verification", async () => {
    const formData = new FormData();
    formData.set("code", "not_a_code");

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
      customerPhone: ["Informe um telefone válido com DDD, como (11) 98888-7777."],
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

describe("cancelPublicBooking", () => {
  const token = "A".repeat(43);
  const cancelledBooking = {
    id: "booking-1",
    business_id: "business-1",
    status: "cancelled",
    start_at: "2026-10-20T12:00:00Z",
    public_code: "65925DBB",
    customer_name_snapshot: "Maria Souza",
    customer_email_snapshot: "maria@example.com",
    service_name_snapshot: "Corte",
  };

  function cancelForm(reason?: string): FormData {
    const formData = new FormData();
    formData.set("code", "65925DBB");
    formData.set("token", token);
    if (reason) formData.set("cancelReason", reason);
    return formData;
  }

  beforeEach(() => {
    vi.stubEnv("APP_URL", "https://agenda.example");
    state.rpcCalls = [];
    state.queries = [];
    state.business = { name: "Barbearia Demo", slug: "barbearia-demo", timezone: "America/Fortaleza" };
    state.rpcResults = { cancel_booking_by_public_code: { data: cancelledBooking, error: null } };
    sendCustomerCancelledEmail.mockClear();
    sendCustomerCancelledEmail.mockResolvedValue({ sent: true });
    vi.mocked(syncGoogleCalendarBooking).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("e-mails the cliente once the reserva is cancelled, in the negócio's timezone", async () => {
    const result = await cancelPublicBooking({ status: "idle" }, cancelForm());

    expect(result).toEqual({ status: "done" });
    expect(sendCustomerCancelledEmail).toHaveBeenCalledTimes(1);
    expect(sendCustomerCancelledEmail).toHaveBeenCalledWith({
      customerName: "Maria Souza",
      customerEmail: "maria@example.com",
      businessName: "Barbearia Demo",
      serviceName: "Corte",
      startAt: "2026-10-20T12:00:00Z",
      timezone: "America/Fortaleza",
      publicCode: "65925DBB",
      rebookUrl: "https://agenda.example/barbearia-demo",
    });
  });

  it("never passes the cancel token or the cancel reason to the e-mail", async () => {
    await cancelPublicBooking({ status: "idle" }, cancelForm("Imprevisto no trabalho"));

    const emailInput = JSON.stringify(sendCustomerCancelledEmail.mock.calls[0][0]);
    expect(emailInput).not.toContain(token);
    expect(emailInput).not.toContain("confirmacao");
    expect(emailInput).not.toContain("Imprevisto");
  });

  it("does not e-mail when the reserva has no customer e-mail", async () => {
    state.rpcResults.cancel_booking_by_public_code = {
      data: { ...cancelledBooking, customer_email_snapshot: null },
      error: null,
    };

    const result = await cancelPublicBooking({ status: "idle" }, cancelForm());

    expect(result).toEqual({ status: "done" });
    expect(sendCustomerCancelledEmail).not.toHaveBeenCalled();
  });

  it("does not e-mail when the cancellation is rejected", async () => {
    state.rpcResults.cancel_booking_by_public_code = { data: null, error: { message: "CANCELLATION_REJECTED" } };

    const result = await cancelPublicBooking({ status: "idle" }, cancelForm());

    expect(result).toMatchObject({ status: "error", code: "INVALID_TOKEN" });
    expect(sendCustomerCancelledEmail).not.toHaveBeenCalled();
  });

  it("tells the cliente to talk to the negócio when the reserva has already started", async () => {
    state.rpcResults.cancel_booking_by_public_code = { data: null, error: { message: "BOOKING_ALREADY_STARTED" } };

    const result = await cancelPublicBooking({ status: "idle" }, cancelForm());

    expect(result).toEqual({
      status: "error",
      code: "ALREADY_STARTED",
      message: "Este horário já passou. Fale com o negócio.",
    });
    expect(sendCustomerCancelledEmail).not.toHaveBeenCalled();
    expect(syncGoogleCalendarBooking).not.toHaveBeenCalled();
  });

  it("keeps the cancellation when the e-mail fails and logs it without the token", async () => {
    sendCustomerCancelledEmail.mockResolvedValue({ sent: false, reason: "provider_error" });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await cancelPublicBooking({ status: "idle" }, cancelForm());

    expect(result).toEqual({ status: "done" });
    expect(consoleError).toHaveBeenCalledWith("booking_cancellation_email_failed", {
      bookingId: "booking-1",
      reason: "provider_error",
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(token);
  });

  it("logs the e-mail failure when the negócio cannot be loaded, keeping the cancellation", async () => {
    state.business = null;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await cancelPublicBooking({ status: "idle" }, cancelForm());

    expect(result).toEqual({ status: "done" });
    expect(sendCustomerCancelledEmail).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("booking_cancellation_email_failed", {
      bookingId: "booking-1",
      reason: "business_not_found",
    });
  });

  it("keeps the cancellation when building or sending the e-mail throws", async () => {
    sendCustomerCancelledEmail.mockRejectedValue(new RangeError("Invalid time zone specified"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await cancelPublicBooking({ status: "idle" }, cancelForm());

    expect(result).toEqual({ status: "done" });
    expect(consoleError).toHaveBeenCalledWith("booking_cancellation_email_failed", {
      bookingId: "booking-1",
      reason: "unexpected_error",
    });
  });

  it("uses the reserva returned by the cancellation instead of reading bookings again", async () => {
    vi.mocked(classifyCancellationReason).mockReturnValueOnce({ category: "schedule_conflict", confidence: 0.9 });

    await cancelPublicBooking({ status: "idle" }, cancelForm("Imprevisto no trabalho"));

    expect(syncGoogleCalendarBooking).toHaveBeenCalledWith("business-1", "booking-1");
    expect(state.queries.filter((query) => query.table === "bookings")).toEqual([
      { table: "bookings", filters: [["id", "booking-1"]], update: { cancel_reason_category: "schedule_conflict" } },
    ]);
  });
});
