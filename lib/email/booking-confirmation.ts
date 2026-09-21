import { formatWhen } from "@/lib/format/when";

type BookingConfirmation = {
  customerName: string;
  customerEmail: string;
  businessName: string;
  serviceName: string;
  startAt: string;
  publicCode: string;
};

type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };

export async function sendBookingConfirmationEmail(input: BookingConfirmation): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, reason: "not_configured" };

  const text = [
    `Olá, ${input.customerName}!`,
    "",
    "Sua reserva está confirmada.",
    `Negócio: ${input.businessName}`,
    `Serviço: ${input.serviceName}`,
    `Data e horário: ${formatWhen(input.startAt)} (horário de Brasília)`,
    `Código da reserva: ${input.publicCode}`,
    "",
    "Guarde este e-mail para consultar os dados da reserva.",
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.customerEmail],
        subject: "Sua reserva foi confirmada",
        text,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok ? { sent: true } : { sent: false, reason: "provider_error" };
  } catch {
    return { sent: false, reason: "provider_error" };
  }
}
