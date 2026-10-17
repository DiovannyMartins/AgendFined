import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    booking: null as { id: string; status: string; start_at: string } | null,
    updates: [] as Record<string, unknown>[],
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/bookings/classification", () => ({ classifyCancellationReason: vi.fn(async () => null) }));
vi.mock("@/lib/google-calendar/sync", () => ({ syncGoogleCalendarBooking: vi.fn() }));
vi.mock("@/lib/business/queries", () => ({ getCurrentBusiness: async () => ({ id: "business-1" }) }));
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
    state.booking = { id: "booking-1", status: "confirmed", start_at: START_AT };
    state.updates = [];
  });

  afterEach(() => {
    vi.useRealTimers();
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
});
