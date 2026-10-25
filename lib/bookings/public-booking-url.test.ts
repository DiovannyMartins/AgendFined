import { describe, expect, it } from "vitest";
import { buildCalendarEventUrl, buildPublicBookingUrl } from "./public-booking-url";

describe("buildPublicBookingUrl", () => {
  it("points to the negócio's public page on the app origin", () => {
    expect(buildPublicBookingUrl(new URL("https://agenda.example/base"), "barbearia-demo")).toBe(
      "https://agenda.example/barbearia-demo",
    );
  });

  it("encodes the slug as a single path segment", () => {
    expect(buildPublicBookingUrl(new URL("https://agenda.example"), "a/b")).toBe("https://agenda.example/a%2Fb");
  });
});

// #196: o .ics da reserva sai do link de confirmação, sem o token.
describe("buildCalendarEventUrl", () => {
  it("points to the reserva's .ics by its code on the same origin", () => {
    expect(buildCalendarEventUrl("https://agenda.example/barbearia/confirmacao?code=65925DBB")).toBe(
      "https://agenda.example/barbearia/confirmacao/evento.ics?code=65925DBB",
    );
  });

  it.each([
    ["the capability fragment", "https://agenda.example/barbearia/confirmacao?code=65925DBB#cancel=private_token"],
    ["a legacy cancel parameter", "https://agenda.example/barbearia/confirmacao?code=65925DBB&cancel=private_token"],
  ])("drops %s", (_case, confirmationUrl) => {
    const url = buildCalendarEventUrl(confirmationUrl);

    expect(url).toBe("https://agenda.example/barbearia/confirmacao/evento.ics?code=65925DBB");
    expect(url).not.toContain("private_token");
  });
});
