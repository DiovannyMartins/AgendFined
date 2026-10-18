import { describe, expect, it } from "vitest";
import { formatCurrencyBRL, formatPriceInput, parsePriceToCents } from "./currency";

describe("formatCurrencyBRL", () => {
  it("formats cents as R$ with a comma decimal separator", () => {
    expect(formatCurrencyBRL(4990)).toBe("R$ 49,90");
    expect(formatCurrencyBRL(0)).toBe("R$ 0,00");
    expect(formatCurrencyBRL(123456)).toBe("R$ 1.234,56");
  });
});

describe("parsePriceToCents", () => {
  it("accepts comma and dot as the decimal separator", () => {
    expect(parsePriceToCents("49,90")).toBe(4990);
    expect(parsePriceToCents("49.90")).toBe(4990);
    expect(parsePriceToCents("49")).toBe(4900);
    expect(parsePriceToCents("49,9")).toBe(4990);
    expect(parsePriceToCents(" 0,05 ")).toBe(5);
    expect(parsePriceToCents("0")).toBe(0);
  });

  it("does not lose cents to floating point", () => {
    expect(parsePriceToCents("0,29")).toBe(29);
    expect(parsePriceToCents("1,15")).toBe(115);
    expect(parsePriceToCents("4,35")).toBe(435);
  });

  it("rejects anything that is not a plain amount in reais", () => {
    for (const input of ["", "abc", "-1", "49,901", "49,", ",90", "1.234,56", "R$ 49,90", "49 90"]) {
      expect(parsePriceToCents(input), input).toBeNull();
    }
  });
});

describe("formatPriceInput", () => {
  it("prefills the price field in the Brazilian format", () => {
    expect(formatPriceInput(4990)).toBe("49,90");
    expect(formatPriceInput(5)).toBe("0,05");
  });
});
