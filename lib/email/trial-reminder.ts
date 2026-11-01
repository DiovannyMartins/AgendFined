import { escapeHtml, sendEmail, type SendResult } from "@/lib/email/resend";
import { EMAIL_LOGO_HTML } from "@/lib/email/brand-logo";
import { formatWhenWithTimezone } from "@/lib/format/when";
import { trialBannerMessage } from "@/lib/plan/trial";

// Sent to the dono as the teste grátis ends (#261, FR-014; ADR 0013): in D-3
// and D-1 to subscribe before losing access, and in D0 to say the negócio is
// suspended, nothing was deleted and subscribing reactivates it. The cron in
// lib/billing/trial-reminders.ts decides which one is due; this only builds it.
export type TrialReminderKind = "trial_ends_in_3_days" | "trial_ends_in_1_day" | "trial_ended";

type TrialReminderEmail = {
  ownerEmail: string;
  businessName: string;
  kind: TrialReminderKind;
  // Calendar days left in the negócio's fuso; 0 on the last day.
  daysLeft: number;
  trialEndsAt: string;
  timezone: string;
  // Already formatted: "R$ 19,90".
  price: string;
  planUrl: string;
  idempotencyKey: string;
};

type Content = { subject: string; heading: string; paragraph: string; cta: string };

function buildContent(input: TrialReminderEmail): Content {
  const endsAt = formatWhenWithTimezone(input.trialEndsAt, input.timezone);
  const plan = `o Plano AgendFined (${input.price}/mês)`;

  if (input.kind === "trial_ended") {
    return {
      subject: "Seu teste grátis acabou",
      heading: "Seu teste grátis acabou.",
      paragraph: `O teste grátis de ${input.businessName} acabou em ${endsAt} e o negócio está suspenso. Nada foi apagado: serviços, clientes e reservas continuam no painel. Assine ${plan} para reativar a página pública e as reservas online.`,
      cta: "Assinar o Plano AgendFined",
    };
  }

  const subject = input.daysLeft <= 0 ? "Seu teste grátis termina hoje" : trialBannerMessage(input.daysLeft);
  return {
    subject,
    heading: `${subject}.`,
    paragraph: `O teste grátis de ${input.businessName} termina em ${endsAt}. Assine ${plan} para não perder o acesso. A primeira cobrança acontece na data do fim do teste.`,
    cta: "Assinar o Plano AgendFined",
  };
}

function buildHtml(input: TrialReminderEmail, content: Content): string {
  const businessName = escapeHtml(input.businessName);
  const planUrl = escapeHtml(input.planUrl);
  const paragraph = escapeHtml(content.paragraph).replace(businessName, `<strong style="color:#eeeeee;">${businessName}</strong>`);

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(content.subject)}</title>
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
                <p style="margin:0 0 12px;color:#b0b0b0;font-size:13px;line-height:20px;">TESTE GRÁTIS DO PLANO AGENDFINED</p>
                <h1 style="margin:0;color:#eeeeee;font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.6px;">${escapeHtml(content.heading)}</h1>
                <p style="margin:16px 0 0;color:#b0b0b0;font-size:16px;line-height:25px;">${paragraph}</p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-collapse:collapse;">
                  <tr>
                    <td style="border-radius:8px;background-color:#ffffff;">
                      <a href="${planUrl}" style="display:inline-block;padding:12px 18px;color:#111111;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(content.cta)}</a>
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

export function sendTrialReminderEmail(input: TrialReminderEmail): Promise<SendResult> {
  const content = buildContent(input);
  const text = [content.heading, "", content.paragraph, "", `${content.cta}: ${input.planUrl}`].join("\n");

  return sendEmail({
    to: input.ownerEmail,
    subject: content.subject,
    text,
    html: buildHtml(input, content),
    idempotencyKey: input.idempotencyKey,
  });
}
