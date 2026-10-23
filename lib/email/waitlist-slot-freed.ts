import { formatWhenWithTimezone } from "@/lib/format/when";
import { escapeHtml, sendEmail, type SendResult } from "@/lib/email/resend";
import { businessContactRowsHtml, businessContactTextLines } from "@/lib/email/business-contact";

// Sent when the negócio clicks "Notificar" on a lista de espera entrada (#152):
// the horário the cliente waited for is free again. Nothing is reserved for the cliente
// yet, so the e-mail says so and links to the public page to reserve it.
type WaitlistSlotFreed = {
  customerName: string;
  customerEmail: string;
  businessName: string;
  serviceName: string;
  startAt: string;
  timezone: string;
  bookingUrl: string;
  businessPhone?: string | null;
};

const SUBJECT = "O horário que você esperava ficou livre";

function buildWaitlistSlotFreedHtml(input: WaitlistSlotFreed, formattedWhen: string): string {
  const customerName = escapeHtml(input.customerName);
  const businessName = escapeHtml(input.businessName);
  const serviceName = escapeHtml(input.serviceName);
  const bookingUrl = escapeHtml(input.bookingUrl);
  const dateAndTime = escapeHtml(formattedWhen);

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${SUBJECT}</title>
  </head>
  <body style="margin:0;background-color:#141414;color:#eeeeee;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#141414;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid #333333;border-radius:12px;border-collapse:separate;background-color:#1c1c1c;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 22px;border-bottom:1px solid #333333;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td valign="middle" style="width:34px;height:34px;border-radius:9px;background-color:#ffffff;color:#111111;font-size:18px;font-weight:700;line-height:34px;text-align:center;">A</td>
                    <td valign="middle" style="padding-left:10px;color:#eeeeee;font-size:17px;font-weight:700;letter-spacing:-0.2px;">AgendFined</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 32px;">
                <p style="margin:0 0 12px;color:#b0b0b0;font-size:13px;line-height:20px;">LISTA DE ESPERA</p>
                <h1 style="margin:0;color:#eeeeee;font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.6px;">O horário que você esperava ficou livre.</h1>
                <p style="margin:16px 0 0;color:#b0b0b0;font-size:16px;line-height:25px;">Olá, ${customerName}! ${businessName} avisa que o horário abaixo foi liberado. Ele ainda não está reservado para você: reserve pelo link antes que outra pessoa o escolha.</p>

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
                    <td style="padding:0 20px 19px;color:#eeeeee;font-size:16px;font-weight:700;line-height:22px;">${dateAndTime}</td>
                  </tr>
                </table>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-collapse:collapse;">
                  <tr>
                    <td style="border-radius:8px;background-color:#ffffff;">
                      <a href="${bookingUrl}" style="display:inline-block;padding:12px 18px;color:#111111;font-size:14px;font-weight:700;text-decoration:none;">Reservar este horário</a>
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

export async function sendWaitlistSlotFreedEmail(input: WaitlistSlotFreed): Promise<SendResult> {
  const formattedWhen = formatWhenWithTimezone(input.startAt, input.timezone);
  const text = [
    `Olá, ${input.customerName}!`,
    "",
    `${input.businessName} avisa que o horário que você esperava ficou livre.`,
    "Ele ainda não está reservado para você: reserve pelo link antes que outra pessoa o escolha.",
    `Negócio: ${input.businessName}`,
    ...businessContactTextLines(input.businessPhone),
    `Serviço: ${input.serviceName}`,
    `Data e horário: ${formattedWhen}`,
    "",
    `Reservar este horário: ${input.bookingUrl}`,
    `Em caso de dúvida, fale diretamente com ${input.businessName}.`,
  ].join("\n");
  const html = buildWaitlistSlotFreedHtml(input, formattedWhen);

  return sendEmail({ to: input.customerEmail, subject: SUBJECT, text, html });
}
