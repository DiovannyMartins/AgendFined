import { describe, expect, it } from "vitest";
import { formatTimezone, formatTimezoneOffset, formatWhenWithTimezone, timezoneCity } from "./when";

describe("fuso labels", () => {
  it("names the fuso by its city and UTC offset", () => {
    expect(formatTimezone("America/Manaus", "2026-10-20T13:00:00Z")).toBe("Manaus (UTC−4)");
    expect(formatTimezone("America/Sao_Paulo", "2026-10-20T13:00:00Z")).toBe("Brasília (UTC−3)");
    expect(formatTimezone("UTC", "2026-10-20T13:00:00Z")).toBe("UTC");
  });

  it("follows daylight saving at the given instant", () => {
    expect(formatTimezoneOffset("Europe/Lisbon", "2026-07-01T12:00:00Z")).toBe("UTC+1");
    expect(formatTimezoneOffset("Europe/Lisbon", "2026-12-01T12:00:00Z")).toBe("UTC");
  });

  it("falls back to the IANA city for a fuso outside the dashboard list", () => {
    expect(timezoneCity("America/Porto_Velho")).toBe("Porto Velho");
    expect(timezoneCity("UTC")).toBeNull();
  });
});

describe("formatWhenWithTimezone", () => {
  it("always says which fuso the time is in", () => {
    expect(formatWhenWithTimezone("2026-10-20T14:00:00Z", "America/Manaus")).toBe(
      "20/10/2026 às 10:00 (horário de Manaus, UTC−4)",
    );
    expect(formatWhenWithTimezone("2026-10-20T14:00:00Z", "UTC")).toBe("20/10/2026 às 14:00 (UTC)");
  });
});
