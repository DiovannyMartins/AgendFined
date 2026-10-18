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
  },
  sendBusinessCancelledEmail: vi.fn<(input: unknown) => Promise<SendResult>>(async () => ({ sent: true })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/bookings/classification", () => ({ classifyCancellationReason: vi.fn(async () => null) }));
vi.mock("@/lib/google-calendar/sync", () => ({ syncGoogleCalendarBooking: vi.fn() }));
vi.mock("@/lib/email/booking-cancellation", () => ({ sendBusinessCancelledEmail }));
vi.mock("@/lib/business/queries", () => ({
  getCurrentBusiness: async () => ({
    id: "business-1",
    name: "Barbearia Demo",
    slug: "barbearia-demo",
    timezone: "America/Fortaleza",
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
    sendBusinessCancelledEmail.mockClear();
    sendBusinessCancelledEmail.mockResolvedValue({ sent: true });
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
