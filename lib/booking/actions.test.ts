import { describe, expect, it } from "vitest";
import { consultBooking, createBooking, joinWaitlist } from "@/lib/booking/actions";

describe("consultBooking", () => {
  it("reports malformed codes before requiring anti-bot verification", async () => {
    const formData = new FormData();
    formData.set("code", "not-a-code");

    const result = await consultBooking({ status: "idle" }, formData);

    expect(result).toEqual({
      status: "error",
      code: "INVALID_CODE",
      message: "Informe um código de reserva válido.",
    });
  });
});

describe("createBooking", () => {
  const validInput = {
    slug: "barbearia",
    serviceId: "8f14e45f-ceea-467f-a8c8-2a1a0c6e3f4b",
    date: "2026-10-20",
    startTime: "09:00",
    customerName: "Maria Souza",
    customerPhone: "11987654321",
    customerEmail: "maria@example.com",
  };

  it("rejects a one-letter customer name with a pt-BR error on the name field", async () => {
    const result = await createBooking({ ...validInput, customerName: "A" });

    expect(result).toMatchObject({
      ok: false,
      code: "validation",
      message: "Revise os campos destacados.",
      fieldErrors: { customerName: ["Informe seu nome completo."] },
    });
  });

  it("reports every invalid customer field in pt-BR, never with Zod's English defaults", async () => {
    const result = await createBooking({
      ...validInput,
      customerName: undefined as unknown as string,
      customerPhone: "123",
      customerEmail: "maria",
      customerNote: "x".repeat(501),
    });

    expect(result.fieldErrors).toEqual({
      customerName: ["Revise este campo."],
      customerPhone: ["Informe um telefone com DDD."],
      customerEmail: ["Informe um e-mail válido."],
      customerNote: ["A observação não pode passar de 500 caracteres."],
    });
  });

  it("asks for the e-mail when it is left blank", async () => {
    const result = await createBooking({ ...validInput, customerEmail: "" });

    expect(result.fieldErrors).toEqual({ customerEmail: ["Informe seu e-mail."] });
  });

  it("rejects a phone made of letters", async () => {
    const result = await createBooking({ ...validInput, customerPhone: "abcdefgh" });

    expect(result.fieldErrors).toEqual({
      customerPhone: ["O telefone deve ter apenas números, como (11) 98888-7777."],
    });
  });
});

describe("joinWaitlist", () => {
  const validInput = {
    slug: "barbearia",
    serviceId: "8f14e45f-ceea-467f-a8c8-2a1a0c6e3f4b",
    date: "2026-10-20",
    startTime: "09:00",
    customerName: "Maria Souza",
    customerPhone: "11987654321",
  };

  it("rejects an invalid phone with a pt-BR error on the phone field", async () => {
    const result = await joinWaitlist({ ...validInput, customerPhone: "12345678" });

    expect(result).toEqual({
      ok: false,
      code: "validation",
      message: "Revise os campos destacados.",
      fieldErrors: { customerPhone: ["Informe um telefone com DDD."] },
    });
  });
});
