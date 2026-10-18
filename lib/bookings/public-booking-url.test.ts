import { describe, expect, it } from "vitest";
import { buildPublicBookingUrl } from "./public-booking-url";

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
