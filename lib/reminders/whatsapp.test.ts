import { describe, expect, it } from "vitest";
import { buildWhatsAppReminderHref, buildWhatsAppReminderText } from "./whatsapp";

const input = {
  customerName: "Ana",
  customerPhone: "11999990000",
  businessName: "Barbearia Demo",
  serviceName: "Corte",
  startAt: "2026-10-27T13:00:00.000Z",
  timezone: "America/Sao_Paulo",
  publicCode: "65925DBB",
};

describe("lembrete pelo WhatsApp (#195)", () => {
  it("escreve o lembrete com serviço, horário no fuso do negócio e código", () => {
    const text = buildWhatsAppReminderText(input);

    expect(text).toContain("Olá, Ana!");
    expect(text).toContain("Barbearia Demo");
    expect(text).toContain("Corte em 27/10/2026 às 10:00");
    expect(text).toContain("6592-5DBB");
  });

  it("abre a conversa com o celular do cliente e o texto pronto", () => {
    const href = buildWhatsAppReminderHref(input);

    expect(href).toMatch(/^https:\/\/wa\.me\/5511999990000\?text=/);
    expect(decodeURIComponent(href!.split("?text=")[1])).toBe(buildWhatsAppReminderText(input));
  });

  it("não oferece WhatsApp para telefone fixo", () => {
    expect(buildWhatsAppReminderHref({ ...input, customerPhone: "1133334444" })).toBeNull();
  });

  it("omite o código quando a reserva não tem um", () => {
    expect(buildWhatsAppReminderText({ ...input, publicCode: null })).not.toContain("Código");
  });
});
