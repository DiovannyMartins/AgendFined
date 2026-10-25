// Lembrete pelo WhatsApp (#195). No Brasil o cliente lê o WhatsApp, não o
// e-mail, e a reserva pode nem ter e-mail. Sem a API oficial (custo por
// mensagem, template aprovado, consentimento), o dono manda o lembrete do
// próprio WhatsApp: a agenda abre a conversa com o texto pronto.

import { formatPublicCode } from "@/lib/bookings/public-code";
import { whatsappHref } from "@/lib/format/phone";
import { formatWhenWithTimezone } from "@/lib/format/when";

export type WhatsAppReminderInput = {
  customerName: string;
  customerPhone: string;
  businessName: string;
  serviceName: string;
  startAt: string;
  timezone: string;
  publicCode?: string | null;
};

export function buildWhatsAppReminderText(input: WhatsAppReminderInput): string {
  const when = formatWhenWithTimezone(input.startAt, input.timezone);
  const code = input.publicCode ? ` Código da reserva: ${formatPublicCode(input.publicCode)}.` : "";
  return (
    `Olá, ${input.customerName}! Passando para lembrar da sua reserva em ${input.businessName}: ` +
    `${input.serviceName} em ${when}.${code} Até lá!`
  );
}

// null when the phone is not a celular: there is no WhatsApp to open.
export function buildWhatsAppReminderHref(input: WhatsAppReminderInput): string | null {
  const href = whatsappHref(input.customerPhone);
  return href ? `${href}?text=${encodeURIComponent(buildWhatsAppReminderText(input))}` : null;
}
