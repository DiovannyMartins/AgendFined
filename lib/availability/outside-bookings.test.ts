import { describe, expect, it } from "vitest";
import { bookingsOutsideAvailability, outsideBookingsMessage } from "./outside-bookings";

// Segunda, 26/10/2026, 10:00–10:30 em Brasília (UTC−3).
const ana = { customer_name_snapshot: "Ana", start_at: "2026-10-26T13:00:00Z", end_at: "2026-10-26T13:30:00Z" };

describe("bookingsOutsideAvailability", () => {
  it("keeps a reserva inside a faixa of its weekday out of the list", () => {
    expect(bookingsOutsideAvailability([ana], [{ weekday: 2, start_time: "08:00:00", end_time: "12:00:00" }], "America/Sao_Paulo")).toEqual([]);
  });

  it("lists a reserva whose day has no faixa anymore", () => {
    expect(bookingsOutsideAvailability([ana], [{ weekday: 3, start_time: "08:00:00", end_time: "12:00:00" }], "America/Sao_Paulo")).toEqual([ana]);
  });

  it("lists a reserva that only partly fits the new faixa", () => {
    expect(bookingsOutsideAvailability([ana], [{ weekday: 2, start_time: "08:00", end_time: "10:15" }], "America/Sao_Paulo")).toEqual([ana]);
  });

  it("accepts a reserva touching both ends of the faixa", () => {
    expect(bookingsOutsideAvailability([ana], [{ weekday: 2, start_time: "10:00", end_time: "10:30" }], "America/Sao_Paulo")).toEqual([]);
  });

  it("reads the weekday and time in the business timezone", () => {
    // 02:30Z de terça é 22:30 de segunda em Manaus (UTC−4), mas 23:30 em Brasília.
    const late = { customer_name_snapshot: "Bia", start_at: "2026-10-27T02:30:00Z", end_at: "2026-10-27T03:00:00Z" };
    const mondayNight = [{ weekday: 2, start_time: "21:00", end_time: "23:00" }];

    expect(bookingsOutsideAvailability([late], mondayNight, "America/Manaus")).toEqual([]);
    expect(bookingsOutsideAvailability([late], mondayNight, "America/Sao_Paulo")).toEqual([late]);
  });
});

describe("outsideBookingsMessage", () => {
  it("names a single reserva with date, time and cliente", () => {
    expect(outsideBookingsMessage([ana], "America/Sao_Paulo")).toBe(
      "Você ainda tem 1 reserva fora do novo horário: Ana (26/10/2026 às 10:00). Ela continua valendo; se precisar, cancele ou remarque pela agenda.",
    );
  });

  it("lists several reservas in date order and sums up beyond five", () => {
    const bookings = Array.from({ length: 7 }, (_, i) => ({
      customer_name_snapshot: `Cliente ${7 - i}`,
      start_at: `2026-11-${String(10 - i).padStart(2, "0")}T13:00:00Z`,
      end_at: `2026-11-${String(10 - i).padStart(2, "0")}T13:30:00Z`,
    }));

    const message = outsideBookingsMessage(bookings, "America/Sao_Paulo");

    expect(message).toMatch(/^Você ainda tem 7 reservas fora do novo horário: Cliente 1 \(04\/11\/2026 às 10:00\), Cliente 2/);
    expect(message).toContain("Cliente 5 (08/11/2026 às 10:00) e mais 2.");
    expect(message).not.toContain("Cliente 6");
  });
});
