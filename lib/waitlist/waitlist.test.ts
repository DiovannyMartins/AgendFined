import { describe, expect, it } from "vitest";
import { isWaitlistEligible, parseWaitlistInput } from "@/lib/waitlist/waitlist";

const FUTURE = "2099-01-05T14:00:00.000Z";

describe("isWaitlistEligible (INC-3: lista de espera só para horário futuro)", () => {
  it("accepts a slot still in the future", () => {
    expect(isWaitlistEligible(FUTURE, new Date("2026-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("rejects a slot already in the past", () => {
    expect(isWaitlistEligible("2020-01-01T00:00:00.000Z", new Date("2026-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("rejects a slot exactly at now (it is no longer open)", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(isWaitlistEligible("2026-01-01T00:00:00.000Z", now)).toBe(false);
  });
});

describe("parseWaitlistInput (INC-3)", () => {
  const valid = {
    serviceId: "65925dbb-ab9d-42eb-832a-030c1b28d1e5",
    startAt: FUTURE,
    customerName: "Maria",
    customerPhone: "+5511988888888",
  };

  it("accepts valid waitlist input", () => {
    const res = parseWaitlistInput(valid);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.customerName).toBe("Maria");
  });

  it("accepts an optional (or empty) customer email", () => {
    expect(parseWaitlistInput({ ...valid, customerEmail: "" }).ok).toBe(true);
    expect(parseWaitlistInput({ ...valid, customerEmail: undefined }).ok).toBe(true);
    expect(parseWaitlistInput({ ...valid, customerEmail: "a@b.com" }).ok).toBe(true);
  });

  it("rejects a non-uuid service id", () => {
    expect(parseWaitlistInput({ ...valid, serviceId: "x" }).ok).toBe(false);
  });

  it("rejects a short or missing customer name/phone", () => {
    expect(parseWaitlistInput({ ...valid, customerName: "A" }).ok).toBe(false);
    expect(parseWaitlistInput({ ...valid, customerPhone: "123" }).ok).toBe(false);
  });

  it("stores the customer phone in the same normalized form as a reserva", () => {
    const res = parseWaitlistInput({ ...valid, customerPhone: "+55 (11) 98888-7777" });
    expect(res.ok && res.data.customerPhone).toBe("11988887777");
  });

  it("rejects a non-phone with a pt-BR error on the phone field", () => {
    expect(parseWaitlistInput({ ...valid, customerPhone: "abcdefgh" })).toMatchObject({
      ok: false,
      fieldErrors: { customerPhone: ["Informe um telefone válido com DDD, como (11) 98888-7777."] },
    });
    expect(parseWaitlistInput({ ...valid, customerPhone: "12345678" })).toMatchObject({
      ok: false,
      fieldErrors: { customerPhone: ["Informe um telefone com DDD."] },
    });
  });

  it("rejects a non-datetime startAt", () => {
    expect(parseWaitlistInput({ ...valid, startAt: "not-a-date" }).ok).toBe(false);
  });
});
