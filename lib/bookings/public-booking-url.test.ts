import { describe, expect, it } from "vitest";
import { buildPublicBookingUrl } from "./public-booking-url";

describe("buildPublicBookingUrl", () => {
  it("points to the negócio's public page on the configured origin", () => {
    expect(buildPublicBookingUrl("https://agenda.example/base", "barbearia-demo")).toBe(
      "https://agenda.example/barbearia-demo",
    );
  });

  it("falls back to localhost when the configured origin is invalid", () => {
    expect(buildPublicBookingUrl("not a url", "barbearia")).toBe("http://localhost:3000/barbearia");
  });
});
