import { formatWhenWithTimezone } from "@/lib/format/when";
import { escapeHtml, sendEmail, type SendResult } from "@/lib/email/resend";
import { EMAIL_LOGO_HTML } from "@/lib/email/brand-logo";
import { businessContactRowsHtml, businessContactTextLines } from "@/lib/email/business-contact";

// Sent when the cliente enters the lista de espera and gave an e-mail (#152).
// Nothing is reserved yet, so the e-mail says so; it carries the private link
// to leave the list, which only its holder can use (ADR 0005).
type WaitlistJoined = {
  customerName: string;
  customerEmail: string;
  businessName: string;
  serviceName: string;
  startAt: string;
  timezone: string;
  leaveUrl: string;
  businessPhone?: string | null;
};

const SUBJECT = "Você está na lista de espera";

function buildWaitlistJoinedHtml(input: WaitlistJoined, formattedWhen: string): string {
  const customerName = escapeHtml(input.customerName);
  const businessName = escapeHtml(input.businessName);
  const serviceName = escapeHtml(input.serviceName);
  const leaveUrl = escapeHtml(input.leaveUrl);
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
                ${EMAIL_LOGO_HTML}
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 32px;">
                <p style="margin:0 0 12px;color:#b0b0b0;font-size:13px;line-height:20px;">LISTA DE ESPERA</p>
                <h1 style="margin:0;color:#eeeeee;font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.6px;">Você está na lista de espera.</h1>
                <p style="margin:16px 0 0;color:#b0b0b0;font-size:16px;line-height:25px;">Olá, ${customerName}! Você entrou na lista de espera de ${businessName} para o horário abaixo. Ele ainda não está reservado para você: se ficar livre, ${businessName} poderá avisar você.</p>

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

                <p style="margin:26px 0 0;color:#b0b0b0;font-size:14px;line-height:22px;">Não quer mais esperar por este horário? Saia da lista pelo link abaixo. Ele é pessoal: não o compartilhe.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;border-collapse:collapse;">
                  <tr>
                    <td style="border-radius:8px;border:1px solid #555555;">
                      <a href="${leaveUrl}" style="display:inline-block;padding:12px 18px;color:#eeeeee;font-size:14px;font-weight:700;text-decoration:none;">Sair da lista de espera</a>
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

export async function sendWaitlistJoinedEmail(input: WaitlistJoined): Promise<SendResult> {
  const formattedWhen = formatWhenWithTimezone(input.startAt, input.timezone);
  const text = [
    `Olá, ${input.customerName}!`,
    "",
    `Você entrou na lista de espera de ${input.businessName} para o horário abaixo.`,
    `Ele ainda não está reservado para você: se ficar livre, ${input.businessName} poderá avisar você.`,
    `Negócio: ${input.businessName}`,
    ...businessContactTextLines(input.businessPhone),
    `Serviço: ${input.serviceName}`,
    `Data e horário: ${formattedWhen}`,
    "",
    `Sair da lista de espera (link pessoal, não compartilhe): ${input.leaveUrl}`,
    `Em caso de dúvida, fale diretamente com ${input.businessName}.`,
  ].join("\n");
  const html = buildWaitlistJoinedHtml(input, formattedWhen);

  return sendEmail({ to: input.customerEmail, subject: SUBJECT, text, html });
}
