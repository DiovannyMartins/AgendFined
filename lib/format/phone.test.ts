import { describe, expect, it } from "vitest";
import { formatPhoneBR, matchesPhone } from "./phone";

describe("formatPhoneBR", () => {
  it.each([
    ["11987654321", "(11) 98765-4321"],
    ["1133334444", "(11) 3333-4444"],
    ["+5511999999999", "(11) 99999-9999"],
    ["(11) 3333-4444", "(11) 3333-4444"],
  ])("formata %j como %j", (stored, shown) => {
    expect(formatPhoneBR(stored)).toBe(shown);
  });

  it("mostra como gravado o telefone que não é brasileiro", () => {
    expect(formatPhoneBR(" +1 415 555 0100 ")).toBe("+1 415 555 0100");
  });
});

describe("matchesPhone", () => {
  it("compara só os dígitos", () => {
    expect(matchesPhone("11987654321", "(11) 98765")).toBe(true);
    expect(matchesPhone("11987654321", "8765-43")).toBe(true);
    expect(matchesPhone("11987654321", "(31)")).toBe(false);
  });

  it("ignora buscas que não parecem telefone", () => {
    expect(matchesPhone("11987654321", "ana")).toBe(false);
    expect(matchesPhone("11987654321", "  ")).toBe(false);
  });
});
