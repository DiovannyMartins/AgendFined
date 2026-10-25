import { formatPublicCode } from "@/lib/bookings/public-code";
import { escapeHtml, sendEmail, type SendResult } from "@/lib/email/resend";
import { EMAIL_LOGO_HTML } from "@/lib/email/brand-logo";
import { businessContactRowsHtml, businessContactTextLines } from "@/lib/email/business-contact";
import { formatWhenWithTimezone } from "@/lib/format/when";

// Sent when a reserva is cancelled, either by the negócio from the dashboard or
// by the cliente through the private cancellation link. It deliberately carries
// no cancel token or private link (the reserva is already cancelled) and no
// cancel reason, which was never promised back to the cliente.
type BookingCancellation = {
  customerName: string;
  customerEmail: string;
  businessName: string;
  serviceName: string;
  startAt: string;
  timezone: string;
  publicCode: string;
  rebookUrl: string;
  businessPhone?: string | null;
};

// Only the wording changes with who cancelled; the reserva details are the same.
type Wording = {
  subject: string;
  heading: string;
  intro: (businessName: string) => string;
};

const BUSINESS_CANCELLED: Wording = {
  subject: "Sua reserva foi cancelada",
  heading: "Sua reserva foi cancelada.",
  intro: (businessName) => `${businessName} cancelou a sua reserva. Você não precisa comparecer neste horário.`,
};

const CUSTOMER_CANCELLED: Wording = {
  subject: "Você cancelou sua reserva",
  heading: "Você cancelou sua reserva.",
  intro: (businessName) => `Você cancelou sua reserva com ${businessName}. O horário foi liberado.`,
};

function buildBookingCancellationHtml(input: BookingCancellation, wording: Wording, formattedWhen: string): string {
  const customerName = escapeHtml(input.customerName);
  const businessName = escapeHtml(input.businessName);
  const serviceName = escapeHtml(input.serviceName);
  const publicCode = escapeHtml(formatPublicCode(input.publicCode));
  const rebookUrl = escapeHtml(input.rebookUrl);
  const dateAndTime = escapeHtml(formattedWhen);

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(wording.subject)}</title>
  </head>
  <body style="margin:0;background-color:#141414;color:#eeeeee;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#141414;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid #333333;border-radius:12px;border-collapse:separate;background-color:#1c1c1c;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 22px;border-bottom:1px solid #333333;">
                ${EMAIL_LOGO_HTML}
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 32px;">
                <p style="margin:0 0 12px;color:#b0b0b0;font-size:13px;line-height:20px;">CANCELAMENTO DE RESERVA</p>
                <h1 style="margin:0;color:#eeeeee;font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.6px;">${escapeHtml(wording.heading)}</h1>
                <p style="margin:16px 0 0;color:#b0b0b0;font-size:16px;line-height:25px;">Olá, ${customerName}! ${wording.intro(businessName)}</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:28px;border:1px solid #333333;border-radius:9px;border-collapse:separate;background-color:#242424;">
                  <tr>
                    <td style="padding:18px 20px 8px;color:#b0b0b0;font-size:12px;line-height:18px;">NEGÓCIO</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 16px;color:#eeeeee;font-size:16px;font-weight:700;line-height:22px;">${businessName}</td>
                  </tr>${businessContactRowsHtml(input.businessPhone)}
                  <tr>
                    <td style="padding:0 20px 8px;color:#b0b0b0;font-size:12px;line-height:18px;">SERVIÇO</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 16px;color:#eeeeee;font-size:16px;font-weight:700;line-height:22px;">${serviceName}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 8px;color:#b0b0b0;font-size:12px;line-height:18px;">DATA E HORÁRIO</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 16px;color:#eeeeee;font-size:16px;font-weight:700;line-height:22px;text-decoration:line-through;">${dateAndTime}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 8px;color:#b0b0b0;font-size:12px;line-height:18px;">CÓDIGO DA RESERVA</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 19px;color:#ffffff;font-size:17px;font-weight:700;letter-spacing:1.4px;line-height:22px;">${publicCode}</td>
                  </tr>
                </table>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-collapse:collapse;">
                  <tr>
                    <td style="border-radius:8px;background-color:#ffffff;">
                      <a href="${rebookUrl}" style="display:inline-block;padding:12px 18px;color:#111111;font-size:14px;font-weight:700;text-decoration:none;">Reservar outro horário</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0;color:#b0b0b0;font-size:14px;line-height:22px;">Em caso de dúvida, fale diretamente com ${businessName}.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;border-top:1px solid #333333;">
                <p style="margin:0;color:#b0b0b0;font-size:12px;line-height:18px;">Enviado por AgendFined · Reservas online para profissionais.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendCancellationEmail(input: BookingCancellation, wording: Wording): Promise<SendResult> {
  const formattedWhen = formatWhenWithTimezone(input.startAt, input.timezone);
  const text = [
    `Olá, ${input.customerName}!`,
    "",
    wording.intro(input.businessName),
    `Negócio: ${input.businessName}`,
    ...businessContactTextLines(input.businessPhone),
    `Serviço: ${input.serviceName}`,
    `Data e horário: ${formattedWhen}`,
    `Código da reserva: ${formatPublicCode(input.publicCode)}`,
    "",
    `Reservar outro horário: ${input.rebookUrl}`,
    `Em caso de dúvida, fale diretamente com ${input.businessName}.`,
  ].join("\n");
  const html = buildBookingCancellationHtml(input, wording, formattedWhen);

  return sendEmail({ to: input.customerEmail, subject: wording.subject, text, html });
}

export function sendBusinessCancelledEmail(input: BookingCancellation): Promise<SendResult> {
  return sendCancellationEmail(input, BUSINESS_CANCELLED);
}

export function sendCustomerCancelledEmail(input: BookingCancellation): Promise<SendResult> {
  return sendCancellationEmail(input, CUSTOMER_CANCELLED);
}
