import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };
type RpcResult = { data: unknown; error: { message: string } | null };
type RecordedQuery = { table: string; filters: [string, unknown][]; update: Record<string, unknown> | null };

const { state, sendCustomerCancelledEmail, sendBookingConfirmationEmail, sendWaitlistJoinedEmail, notifyOwner } = vi.hoisted(() => ({
  state: {
    business: null as Record<string, unknown> | null,
    // Per-table overrides: the row `single` resolves to and the awaited list.
    singles: {} as Record<string, unknown>,
    lists: {} as Record<string, unknown[]>,
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
    rpcResults: {} as Record<string, RpcResult>,
    queries: [] as RecordedQuery[],
  },
  sendCustomerCancelledEmail: vi.fn<(input: unknown) => Promise<SendResult>>(async () => ({ sent: true })),
  sendBookingConfirmationEmail: vi.fn<(input: unknown) => Promise<SendResult>>(async () => ({ sent: true })),
  sendWaitlistJoinedEmail: vi.fn<(input: unknown) => Promise<SendResult>>(async () => ({ sent: true })),
  notifyOwner: vi.fn<(admin: unknown, event: string, booking: unknown) => Promise<void>>(async () => {}),
}));

vi.mock("@/lib/booking/anti-bot", () => ({ verifyTurnstile: async () => ({ ok: true }) }));
vi.mock("@/lib/booking/rate-limit", () => ({
  getClientIp: async () => "203.0.113.7",
  enforceRateLimit: async () => true,
  enforceConsultRateLimit: vi.fn(async () => true),
}));
vi.mock("@/lib/bookings/classification", () => ({
  classifyCancellationReason: vi.fn(async () => null),
  classifyCustomerNote: vi.fn(async () => null),
  classifyOperationalError: vi.fn(async () => null),
}));
vi.mock("@/lib/google-calendar/sync", () => ({ syncGoogleCalendarBooking: vi.fn() }));
vi.mock("@/lib/email/booking-cancellation", () => ({ sendCustomerCancelledEmail }));
vi.mock("@/lib/email/booking-confirmation", () => ({ sendBookingConfirmationEmail }));
vi.mock("@/lib/email/waitlist-joined", () => ({ sendWaitlistJoinedEmail }));
vi.mock("@/lib/bookings/owner-notification", () => ({ notifyOwner }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const from = (table: string) => {
      const recorded: RecordedQuery = { table, filters: [], update: null };
      state.queries.push(recorded);
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => (recorded.filters.push([column, value]), query),
        update: (values: Record<string, unknown>) => ((recorded.update = values), query),
        lt: () => query,
        gt: () => query,
        neq: () => query,
        single: async () => ({ data: table in state.singles ? state.singles[table] : state.business, error: null }),
        maybeSingle: async () => ({ data: state.business, error: null }),
        then: (resolve: (value: { data: unknown[] | null; error: null }) => unknown) =>
          Promise.resolve({ data: state.lists[table] ?? null, error: null }).then(resolve),
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

import { createHash } from "node:crypto";
import { cancelPublicBooking, consultBooking, createBooking, joinWaitlist, leaveWaitlist } from "@/lib/booking/actions";
import { enforceConsultRateLimit } from "@/lib/booking/rate-limit";
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

  it.each([
    { date: "2026-13-45" },
    { date: "not-a-date" },
    { startTime: "9h" },
    { startTime: "25:00" },
  ])("answers a malformed slot %j with validation instead of throwing", async (slot) => {
    state.queries = [];

    const result = await createBooking({ ...validInput, ...slot });

    expect(result).toEqual({
      ok: false,
      code: "validation",
      message: "Não foi possível validar o serviço ou o horário. Escolha novamente.",
    });
    expect(state.queries).toEqual([]);
  });

  it("rejects a phone made of letters", async () => {
    const result = await createBooking({ ...validInput, customerPhone: "abcdefgh" });

    expect(result.fieldErrors).toEqual({
      customerPhone: ["Informe um telefone válido com DDD, como (11) 98888-7777."],
    });
  });

  describe("once the reserva is created", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
      state.business = {
        id: "business-1",
        owner_id: "owner-1",
        name: "Barbearia Demo",
        plan: "free",
        slot_interval_minutes: 30,
        min_notice_minutes: 120,
        booking_window_days: 30,
        timezone: "America/Sao_Paulo",
      };
      state.singles = { services: { id: validInput.serviceId, name: "Corte", duration_minutes: 30 } };
      state.lists = { availability: [{ start_time: "08:00:00", end_time: "18:00:00" }], availability_blocks: [], bookings: [] };
      state.rpcResults = { create_booking: { data: { id: "booking-9", public_code: "65925DBB" }, error: null } };
      notifyOwner.mockClear();
      sendBookingConfirmationEmail.mockClear();
    });

    afterEach(() => {
      vi.useRealTimers();
      state.singles = {};
      state.lists = {};
      state.rpcResults = {};
    });

    it("tells the dono about the reserva nova, alongside the cliente's confirmação", async () => {
      const result = await createBooking(validInput);

      expect(result).toMatchObject({ ok: true, publicCode: "65925DBB" });
      expect(sendBookingConfirmationEmail).toHaveBeenCalledTimes(1);
      expect(notifyOwner).toHaveBeenCalledTimes(1);
      expect(notifyOwner).toHaveBeenCalledWith(expect.anything(), "new_booking", {
        bookingId: "booking-9",
        ownerId: "owner-1",
        businessName: "Barbearia Demo",
        customerName: "Maria Souza",
        customerPhone: "11987654321",
        serviceName: "Corte",
        startAt: "2026-10-20T12:00:00.000Z",
        timezone: "America/Sao_Paulo",
        publicCode: "65925DBB",
      });
    });

    it("accepts a horário that crosses the junção of faixas encostadas (#147)", async () => {
      state.singles = { services: { id: validInput.serviceId, name: "Corte feminino", duration_minutes: 45 } };
      state.lists.availability = [
        { start_time: "09:00:00", end_time: "12:00:00" },
        { start_time: "12:00:00", end_time: "17:00:00" },
      ];

      const result = await createBooking({ ...validInput, startTime: "11:30" });

      expect(result).toMatchObject({ ok: true, publicCode: "65925DBB" });
    });

    it("does not tell the dono when the reserva was not created", async () => {
      state.rpcResults.create_booking = { data: null, error: { message: "bookings_no_overlap" } };

      const result = await createBooking(validInput);

      expect(result).toMatchObject({ ok: false, code: "slot_taken" });
      expect(notifyOwner).not.toHaveBeenCalled();
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

  it("answers a malformed date with validation instead of throwing", async () => {
    state.business = { id: "business-1", plan: "pro", timezone: "America/Sao_Paulo" };
    state.rpcCalls = [];

    const result = await joinWaitlist({ ...validInput, date: "2026-02-30" });

    expect(result).toMatchObject({ ok: false, code: "validation" });
    expect(state.rpcCalls).toEqual([]);
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

  // #152: the cliente who gave an e-mail hears that the entrada exists and gets
  // the private link to leave the list (ADR 0005 capability).
  describe("e-mail de entrada", () => {
    const futureInput = { ...validInput, date: "2030-01-15", customerEmail: "maria@example.com" };

    beforeEach(() => {
      vi.stubEnv("APP_URL", "https://agenda.example");
      state.rpcCalls = [];
      state.business = {
        id: "business-1",
        name: "Barbearia",
        phone: "11987654321",
        plan: "pro",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 365,
        timezone: "America/Sao_Paulo",
      };
      state.singles = { services: { name: "Corte" } };
      state.rpcResults = { join_waitlist: { data: { id: "entry-1" }, error: null } };
      sendWaitlistJoinedEmail.mockReset();
      sendWaitlistJoinedEmail.mockResolvedValue({ sent: true });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      state.singles = {};
      state.rpcResults = {};
    });

    it("stores only the digest and e-mails the raw token in the private leave link", async () => {
      const result = await joinWaitlist(futureInput);

      expect(result).toEqual({ ok: true, message: "Você entrou na lista de espera deste horário." });
      const hash = state.rpcCalls[0].args.p_cancel_token_hash as string;
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(sendWaitlistJoinedEmail).toHaveBeenCalledWith({
        customerName: "Maria Souza",
        customerEmail: "maria@example.com",
        businessName: "Barbearia",
        serviceName: "Corte",
        startAt: "2030-01-15T12:00:00.000Z",
        timezone: "America/Sao_Paulo",
        businessPhone: "11987654321",
        leaveUrl: expect.stringMatching(/^https:\/\/agenda\.example\/barbearia\/lista-de-espera\/sair#token=[A-Za-z0-9_-]{43}$/),
      });
      const { leaveUrl } = sendWaitlistJoinedEmail.mock.calls[0][0] as { leaveUrl: string };
      const token = new URL(leaveUrl).hash.slice("#token=".length);
      expect(createHash("sha256").update(token).digest("hex")).toBe(hash);
    });

    it("sends nothing when the cliente gave no e-mail", async () => {
      const result = await joinWaitlist({ ...futureInput, customerEmail: "" });

      expect(result.ok).toBe(true);
      expect(state.rpcCalls[0].args.p_cancel_token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(sendWaitlistJoinedEmail).not.toHaveBeenCalled();
    });

    it("sends nothing when the entrada was not written", async () => {
      state.rpcResults = { join_waitlist: { data: null, error: { message: "WAITLIST_SLOT_NOT_OCCUPIED" } } };

      const result = await joinWaitlist(futureInput);

      expect(result).toMatchObject({ ok: false, code: "slot_free" });
      expect(sendWaitlistJoinedEmail).not.toHaveBeenCalled();
    });

    it("keeps the entrada when the e-mail fails, logging without the token", async () => {
      sendWaitlistJoinedEmail.mockResolvedValue({ sent: false, reason: "provider_error" });
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await joinWaitlist(futureInput);

      expect(result.ok).toBe(true);
      expect(consoleError).toHaveBeenCalledWith("waitlist_joined_email_failed", {
        entryId: "entry-1",
        reason: "provider_error",
      });
    });

    it("keeps the entrada when sending the e-mail throws", async () => {
      sendWaitlistJoinedEmail.mockRejectedValue(new RangeError("Invalid time zone specified"));
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await joinWaitlist(futureInput);

      expect(result.ok).toBe(true);
      expect(consoleError).toHaveBeenCalledWith("waitlist_joined_email_failed", {
        entryId: "entry-1",
        reason: "unexpected_error",
      });
    });
  });
});

describe("leaveWaitlist", () => {
  const token = "A".repeat(43);

  function leaveForm(value = token): FormData {
    const formData = new FormData();
    formData.set("token", value);
    return formData;
  }

  beforeEach(() => {
    state.rpcCalls = [];
    state.rpcResults = { cancel_waitlist_entry_by_token: { data: { id: "entry-1", status: "cancelled" }, error: null } };
  });

  afterEach(() => {
    state.rpcResults = {};
  });

  it("sends only the token digest and leaves the list", async () => {
    const result = await leaveWaitlist({ status: "idle" }, leaveForm());

    expect(result).toEqual({ status: "done" });
    expect(state.rpcCalls).toEqual([
      {
        name: "cancel_waitlist_entry_by_token",
        args: { p_cancel_token_hash: createHash("sha256").update(token).digest("hex") },
      },
    ]);
  });

  it("refuses a malformed token without calling the database", async () => {
    const result = await leaveWaitlist({ status: "idle" }, leaveForm("curto"));

    expect(result).toMatchObject({ status: "error", code: "INVALID_TOKEN" });
    expect(state.rpcCalls).toEqual([]);
  });

  it("answers every database rejection with the same generic message", async () => {
    state.rpcResults = {
      cancel_waitlist_entry_by_token: { data: null, error: { message: "WAITLIST_CANCELLATION_REJECTED" } },
    };

    const result = await leaveWaitlist({ status: "idle" }, leaveForm());

    expect(result).toEqual(await leaveWaitlist({ status: "idle" }, leaveForm("curto")));
    expect(result).toMatchObject({ status: "error", code: "INVALID_TOKEN" });
  });

  it("fails closed when rate limited or when the limiter is unavailable", async () => {
    vi.mocked(enforceConsultRateLimit).mockResolvedValueOnce(false);
    await expect(leaveWaitlist({ status: "idle" }, leaveForm())).resolves.toMatchObject({ code: "RATE_LIMITED" });

    vi.mocked(enforceConsultRateLimit).mockRejectedValueOnce(new Error("limiter down"));
    await expect(leaveWaitlist({ status: "idle" }, leaveForm())).resolves.toMatchObject({ code: "RATE_LIMITED" });

    expect(state.rpcCalls).toEqual([]);
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
    customer_phone_snapshot: "11987654321",
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
    state.business = { name: "Barbearia Demo", slug: "barbearia-demo", timezone: "America/Fortaleza", owner_id: "owner-1" };
    state.rpcResults = { cancel_booking_by_public_code: { data: cancelledBooking, error: null } };
    notifyOwner.mockClear();
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
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("tells the dono the cliente cancelled, without the token or the cancel reason", async () => {
    const result = await cancelPublicBooking({ status: "idle" }, cancelForm("Imprevisto no trabalho"));

    expect(result).toEqual({ status: "done" });
    expect(notifyOwner).toHaveBeenCalledTimes(1);
    expect(notifyOwner).toHaveBeenCalledWith(expect.anything(), "customer_cancelled", {
      bookingId: "booking-1",
      ownerId: "owner-1",
      businessName: "Barbearia Demo",
      customerName: "Maria Souza",
      customerPhone: "11987654321",
      serviceName: "Corte",
      startAt: "2026-10-20T12:00:00Z",
      timezone: "America/Fortaleza",
      publicCode: "65925DBB",
    });
    const ownerInput = JSON.stringify(notifyOwner.mock.calls[0][2]);
    expect(ownerInput).not.toContain(token);
    expect(ownerInput).not.toContain("Imprevisto");
  });

  it("tells the dono even when the reserva has no customer e-mail", async () => {
    state.rpcResults.cancel_booking_by_public_code = {
      data: { ...cancelledBooking, customer_email_snapshot: null },
      error: null,
    };

    await cancelPublicBooking({ status: "idle" }, cancelForm());

    expect(sendCustomerCancelledEmail).not.toHaveBeenCalled();
    expect(notifyOwner).toHaveBeenCalledWith(expect.anything(), "customer_cancelled", expect.anything());
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
