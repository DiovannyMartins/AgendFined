import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type BookingRow = {
  id: string;
  status: string;
  start_at: string;
  public_code: string;
  customer_name_snapshot: string;
  customer_email_snapshot: string | null;
  service_name_snapshot: string;
};

type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };

const { state, sendBusinessCancelledEmail } = vi.hoisted(() => ({
  state: {
    booking: null as BookingRow | null,
    updates: [] as Record<string, unknown>[],
    conflict: false,
    hasAccess: true,
  },
  sendBusinessCancelledEmail: vi.fn<(input: unknown) => Promise<SendResult>>(async () => ({ sent: true })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => import("@/tests/mocks/rate-limit-admin"));
vi.mock("@/lib/bookings/classification", () => ({ classifyCancellationReason: vi.fn(async () => null) }));
vi.mock("@/lib/google-calendar/sync", () => ({ syncGoogleCalendarBooking: vi.fn() }));
vi.mock("@/lib/email/booking-cancellation", () => ({ sendBusinessCancelledEmail }));
vi.mock("@/lib/business/queries", () => ({
  getCurrentBusiness: async () => ({
    id: "business-1",
    owner_id: "owner-1",
    name: "Barbearia Demo",
    slug: "barbearia-demo",
    timezone: "America/Fortaleza",
    has_access: state.hasAccess,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      let patch: Record<string, unknown> | null = null;
      const query = {
        select: () => query,
        eq: () => query,
        update: (values: Record<string, unknown>) => ((patch = values), query),
        maybeSingle: async () => ({ data: state.booking, error: null }),
        then: (resolve: (value: { data: { id: string }[]; error: null }) => unknown) => {
          if (patch && state.conflict) {
            return Promise.resolve({ data: [], error: null }).then(resolve);
          }
          if (patch && state.booking) {
            state.updates.push(patch);
            state.booking = { ...state.booking, ...(patch as { status: string }) };
          }
          return Promise.resolve({ data: state.booking ? [{ id: state.booking.id }] : [], error: null }).then(resolve);
        },
      };
      return query;
    },
  }),
}));

import { updateBookingStatus } from "./actions";
import { OWNER_EMAIL_RATE_LIMIT } from "@/lib/booking/rate-limit";
import { rateLimitAdmin } from "@/tests/mocks/rate-limit-admin";

const START_AT = "2026-10-19T15:00:00.000Z";

function statusForm(status: string) {
  const formData = new FormData();
  formData.set("id", "booking-1");
  formData.set("status", status);
  return formData;
}

describe("updateBookingStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("APP_URL", "https://agenda.example");
    state.booking = {
      id: "booking-1",
      status: "confirmed",
      start_at: START_AT,
      public_code: "65925DBB",
      customer_name_snapshot: "Ana",
      customer_email_snapshot: "ana@example.com",
      service_name_snapshot: "Corte",
    };
    state.updates = [];
    state.conflict = false;
    state.hasAccess = true;
    sendBusinessCancelledEmail.mockClear();
    sendBusinessCancelledEmail.mockResolvedValue({ sent: true });
    rateLimitAdmin.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["completed", "no_show"])("refuses %s before the reserva starts and keeps it confirmed", async (status) => {
    vi.setSystemTime(new Date("2026-10-19T14:59:00.000Z"));

    const result = await updateBookingStatus({ ok: true }, statusForm(status));

    expect(result).toEqual({ ok: false, message: "Só é possível marcar após o início do atendimento." });
    expect(state.updates).toEqual([]);
    expect(state.booking?.status).toBe("confirmed");
  });

  it.each(["completed", "no_show"])("applies %s once the reserva has started", async (status) => {
    vi.setSystemTime(new Date(START_AT));

    const result = await updateBookingStatus({ ok: true }, statusForm(status));

    expect(result).toEqual({ ok: true });
    expect(state.booking?.status).toBe(status);
  });

  it("names both statuses in pt-BR when the transition is not allowed", async () => {
    vi.setSystemTime(new Date(START_AT));
    state.booking = { ...state.booking!, status: "completed" };

    const result = await updateBookingStatus({ ok: true }, statusForm("cancelled"));

    expect(result).toEqual({ ok: false, message: 'Não é possível mudar de "Concluída" para "Cancelada".' });
    expect(state.updates).toEqual([]);
  });

  it.each([
    ["no_show", "completed"],
    ["completed", "no_show"],
  ])("corrects %s to %s without emailing the cliente (#145)", async (from, to) => {
    vi.setSystemTime(new Date("2026-10-19T15:20:00.000Z"));
    state.booking = { ...state.booking!, status: from };

    const result = await updateBookingStatus({ ok: true }, statusForm(to));

    expect(result).toEqual({ ok: true });
    expect(state.updates).toEqual([{ status: to }]);
    expect(sendBusinessCancelledEmail).not.toHaveBeenCalled();
  });

  it("refuses a cancellation reason longer than the 250 characters the database accepts", async () => {
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));
    const overLimit = statusForm("cancelled");
    overLimit.set("cancelReason", "a".repeat(251));
    const atLimit = statusForm("cancelled");
    atLimit.set("cancelReason", "a".repeat(250));

    expect(await updateBookingStatus({ ok: true }, overLimit)).toEqual({
      ok: false,
      message: "O motivo do cancelamento é muito longo.",
    });
    expect(state.updates).toEqual([]);
    expect(await updateBookingStatus({ ok: true }, atLimit)).toEqual({ ok: true });
  });

  it("lets a suspended negócio cancel a reserva but not conclude one (ADR 0013)", async () => {
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));
    state.hasAccess = false;

    expect(await updateBookingStatus({ ok: true }, statusForm("cancelled"))).toEqual({ ok: true });
    expect(state.booking?.status).toBe("cancelled");

    state.booking = { ...state.booking!, status: "confirmed" };
    vi.setSystemTime(new Date("2026-10-19T18:00:00.000Z"));
    const concluded = await updateBookingStatus({ ok: true }, statusForm("completed"));
    expect(concluded).toMatchObject({ ok: false, message: expect.stringContaining("suspenso") });
    expect(state.booking?.status).toBe("confirmed");
  });

  it("still cancels a reserva that has not started", async () => {
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));

    const result = await updateBookingStatus({ ok: true }, statusForm("cancelled"));

    expect(result).toEqual({ ok: true });
    expect(state.booking?.status).toBe("cancelled");
  });

  it("emails the cliente when the negócio cancels the reserva, without the internal reason", async () => {
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));
    const form = statusForm("cancelled");
    form.set("cancelReason", "Imprevisto interno");

    await expect(updateBookingStatus({ ok: true }, form)).resolves.toEqual({ ok: true });

    expect(sendBusinessCancelledEmail).toHaveBeenCalledTimes(1);
    expect(sendBusinessCancelledEmail).toHaveBeenCalledWith({
      customerName: "Ana",
      customerEmail: "ana@example.com",
      businessName: "Barbearia Demo",
      serviceName: "Corte",
      startAt: START_AT,
      timezone: "America/Fortaleza",
      publicCode: "65925DBB",
      rebookUrl: "https://agenda.example/barbearia-demo",
    });
    expect(JSON.stringify(sendBusinessCancelledEmail.mock.calls[0])).not.toContain("Imprevisto interno");
  });

  it("keeps the cancellation and logs the failure when the email is not sent", async () => {
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    sendBusinessCancelledEmail.mockResolvedValue({ sent: false, reason: "provider_error" });

    await expect(updateBookingStatus({ ok: true }, statusForm("cancelled"))).resolves.toEqual({ ok: true });

    expect(state.booking?.status).toBe("cancelled");
    expect(consoleError).toHaveBeenCalledWith("booking_cancellation_email_failed", {
      bookingId: "booking-1",
      reason: "provider_error",
    });
  });

  it("skips the email when the reserva has no cliente address", async () => {
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));
    state.booking = { ...state.booking!, customer_email_snapshot: null };

    await expect(updateBookingStatus({ ok: true }, statusForm("cancelled"))).resolves.toEqual({ ok: true });

    expect(sendBusinessCancelledEmail).not.toHaveBeenCalled();
    expect(rateLimitAdmin.counts.size).toBe(0);
  });

  it("cancels without emailing past the negócio's e-mail budget and asks for WhatsApp", async () => {
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { limit } = OWNER_EMAIL_RATE_LIMIT.perOwnerHourly;
    rateLimitAdmin.counts.set("owner:owner-1|owner_email|1h", limit);

    const result = await updateBookingStatus({ ok: true }, statusForm("cancelled"));

    expect(result).toEqual({
      ok: true,
      message: "Reserva cancelada, mas o e-mail não saiu. Avise o cliente pelo WhatsApp.",
    });
    expect(state.booking?.status).toBe("cancelled");
    expect(sendBusinessCancelledEmail).not.toHaveBeenCalled();
  });

  it("cancels without emailing when the e-mail counter is unavailable", async () => {
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    rateLimitAdmin.failing = true;

    const result = await updateBookingStatus({ ok: true }, statusForm("cancelled"));

    expect(result.ok).toBe(true);
    expect(state.booking?.status).toBe("cancelled");
    expect(sendBusinessCancelledEmail).not.toHaveBeenCalled();
  });

  it("skips the email when the cancellation loses the race to another operation", async () => {
    vi.setSystemTime(new Date("2026-10-17T12:00:00.000Z"));
    state.conflict = true;

    const result = await updateBookingStatus({ ok: true }, statusForm("cancelled"));

    expect(result.ok).toBe(false);
    expect(sendBusinessCancelledEmail).not.toHaveBeenCalled();
  });

  it.each(["completed", "no_show"])("does not send a cancellation email when marking %s", async (status) => {
    vi.setSystemTime(new Date(START_AT));

    await updateBookingStatus({ ok: true }, statusForm(status));

    expect(sendBusinessCancelledEmail).not.toHaveBeenCalled();
  });
});
