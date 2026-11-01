import { escapeHtml, sendEmail, type SendResult } from "@/lib/email/resend";
import { EMAIL_LOGO_HTML } from "@/lib/email/brand-logo";

// Sent to the dono when the Mercado Pago could not charge the assinatura and
// paused it (issue #151). The negócio keeps its access during the carência;
// without this e-mail the dono would only learn about it after the suspension
// (ADR 0013). It carries the date the carência ends and a link to the "Plano"
// section, where the payment method is updated.
type PaymentFailedEmail = {
  ownerEmail: string;
  businessName: string;
  // Already formatted in the negócio's fuso: "27/10/2026".
  activeUntil: string;
  planUrl: string;
};

const SUBJECT = "Não conseguimos cobrar a sua assinatura";

function buildPaymentFailedHtml(input: PaymentFailedEmail): string {
  const businessName = escapeHtml(input.businessName);
  const activeUntil = escapeHtml(input.activeUntil);
  const planUrl = escapeHtml(input.planUrl);

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
                <p style="margin:0 0 12px;color:#b0b0b0;font-size:13px;line-height:20px;">ASSINATURA DO PLANO AGENDFINED</p>
                <h1 style="margin:0;color:#eeeeee;font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.6px;">${SUBJECT}.</h1>
                <p style="margin:16px 0 0;color:#b0b0b0;font-size:16px;line-height:25px;">O Mercado Pago recusou a cobrança do Plano AgendFined de ${businessName}. Atualize a forma de pagamento até <strong style="color:#eeeeee;">${activeUntil}</strong> para manter o acesso. Depois dessa data, o negócio fica suspenso, sem perder dados.</p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-collapse:collapse;">
                  <tr>
                    <td style="border-radius:8px;background-color:#ffffff;">
                      <a href="${planUrl}" style="display:inline-block;padding:12px 18px;color:#111111;font-size:14px;font-weight:700;text-decoration:none;">Atualizar forma de pagamento</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;border-top:1px solid #333333;">
                <p style="margin:0;color:#b0b0b0;font-size:12px;line-height:18px;">Enviado por AgendFined para o e-mail da conta de ${businessName}.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function sendPaymentFailedEmail(input: PaymentFailedEmail): Promise<SendResult> {
  const text = [
    `${SUBJECT}.`,
    "",
    `O Mercado Pago recusou a cobrança do Plano AgendFined de ${input.businessName}. Atualize a forma de pagamento até ${input.activeUntil} para manter o acesso. Depois dessa data, o negócio fica suspenso, sem perder dados.`,
    "",
    `Atualizar forma de pagamento: ${input.planUrl}`,
  ].join("\n");

  return sendEmail({ to: input.ownerEmail, subject: SUBJECT, text, html: buildPaymentFailedHtml(input) });
}
