import { describe, expect, it } from "vitest";
import { TIMEZONE_OPTIONS, isBrazilianTimeZone } from "./app-timezone";

// #189: phones are always Brazilian, so a negócio can only pick a Brazilian fuso.
describe("TIMEZONE_OPTIONS", () => {
  it("offers only Brazilian fusos", () => {
    for (const option of TIMEZONE_OPTIONS) expect(isBrazilianTimeZone(option.value)).toBe(true);
    expect(TIMEZONE_OPTIONS.map((option) => option.value)).not.toContain("Europe/Lisbon");
  });
});

describe("isBrazilianTimeZone", () => {
  it.each(["America/Sao_Paulo", "America/Fortaleza", "America/Recife", "America/Porto_Velho", "Brazil/East"])(
    "accepts %s",
    (timeZone) => expect(isBrazilianTimeZone(timeZone)).toBe(true),
  );

  it.each(["Europe/Lisbon", "America/New_York", "UTC", "America/Argentina/Buenos_Aires", ""])(
    "rejects %j",
    (timeZone) => expect(isBrazilianTimeZone(timeZone)).toBe(false),
  );
});
