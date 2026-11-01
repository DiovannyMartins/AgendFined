import { escapeHtml, sendEmail, type SendResult } from "@/lib/email/resend";
import { EMAIL_LOGO_HTML } from "@/lib/email/brand-logo";
import { formatDate, formatWhenWithTimezone } from "@/lib/format/when";

// Sent once to each dono who was on the Grátis at the virada (#261, fase 7;
// spec 007 User Story 5, FR-017; ADR 0013): the Grátis is over, the negócio got
// 30 days of teste grátis from the virada, then the Plano AgendFined price, and
// the Termos and Privacidade changed on 1º/11/2026. The cron in
// lib/billing/plan-cutover-notices.ts decides who gets it; this only builds it.
export const TERMS_EFFECTIVE_DATE = "1º/11/2026";

type PlanCutoverEmail = {
  ownerEmail: string;
  businessName: string;
  trialEndsAt: string;
  timezone: string;
  // Already formatted: "R$ 19,90".
  price: string;
  planUrl: string;
  termsUrl: string;
  privacyUrl: string;
  idempotencyKey: string;
};

const SUBJECT = "O plano Grátis acabou: seu teste grátis de 30 dias começou";
const HEADING = "O plano Grátis acabou. Seu teste grátis de 30 dias começou.";
const CTA = "Assinar o Plano AgendFined";

const TRIAL_DAYS = 30;

// "Hoje" on the day of the virada; a later send (the app deployed after the
// migration) names the day instead.
function trialStart(input: PlanCutoverEmail, now: Date): string {
  const start = new Date(Date.parse(input.trialEndsAt) - TRIAL_DAYS * 86_400_000).toISOString();
  const startDay = formatDate(start, input.timezone);
  return startDay === formatDate(now.toISOString(), input.timezone) ? "A partir de hoje" : `Desde ${startDay}`;
}

function paragraphs(input: PlanCutoverEmail, now: Date): string[] {
  const endsAt = formatWhenWithTimezone(input.trialEndsAt, input.timezone);
  return [
    `O AgendFined agora tem um plano só, o Plano AgendFined, e o plano Grátis deixou de existir. ${trialStart(input, now)}, ${input.businessName} tem ${TRIAL_DAYS} dias de teste grátis com tudo incluído, sem cartão, até ${endsAt}.`,
    `Depois do teste, o Plano AgendFined custa ${input.price}/mês. Se você assinar durante o teste, não perde os dias que faltam: a primeira cobrança acontece na data do fim do teste. Você pode cancelar quando quiser. Sem assinatura, o negócio fica suspenso no fim do teste e nada é apagado.`,
  ];
}

function legalNote(): string {
  return `Os Termos de Uso e a Política de Privacidade foram atualizados e valem a partir de ${TERMS_EFFECTIVE_DATE}.`;
}

function buildHtml(input: PlanCutoverEmail, now: Date): string {
  const businessName = escapeHtml(input.businessName);
  const planUrl = escapeHtml(input.planUrl);
  const termsUrl = escapeHtml(input.termsUrl);
  const privacyUrl = escapeHtml(input.privacyUrl);
  const [first, second] = paragraphs(input, now).map((paragraph) => escapeHtml(paragraph));
  const firstHtml = first.replace(businessName, `<strong style="color:#eeeeee;">${businessName}</strong>`);
  const offer = escapeHtml(`30 dias grátis, sem cartão · depois ${input.price}/mês · cancele quando quiser`);
  const linkStyle = "color:#eeeeee;text-decoration:underline;";

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(SUBJECT)}</title>
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
                <p style="margin:0 0 12px;color:#b0b0b0;font-size:13px;line-height:20px;">PLANO AGENDFINED</p>
                <h1 style="margin:0;color:#eeeeee;font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.6px;">${escapeHtml(HEADING)}</h1>
                <p style="margin:16px 0 0;color:#b0b0b0;font-size:16px;line-height:25px;">${firstHtml}</p>
                <p style="margin:16px 0 0;color:#b0b0b0;font-size:16px;line-height:25px;">${second}</p>
                <p style="margin:20px 0 0;color:#eeeeee;font-size:14px;font-weight:700;line-height:22px;">${offer}</p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-collapse:collapse;">
                  <tr>
                    <td style="border-radius:8px;background-color:#ffffff;">
                      <a href="${planUrl}" style="display:inline-block;padding:12px 18px;color:#111111;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(CTA)}</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:26px 0 0;color:#b0b0b0;font-size:14px;line-height:22px;">Os <a href="${termsUrl}" style="${linkStyle}">Termos de Uso</a> e a <a href="${privacyUrl}" style="${linkStyle}">Política de Privacidade</a> foram atualizados e valem a partir de ${escapeHtml(TERMS_EFFECTIVE_DATE)}.</p>
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

export function sendPlanCutoverEmail(input: PlanCutoverEmail, now: Date = new Date()): Promise<SendResult> {
  const text = [
    HEADING,
    "",
    ...paragraphs(input, now).flatMap((paragraph) => [paragraph, ""]),
    `30 dias grátis, sem cartão · depois ${input.price}/mês · cancele quando quiser`,
    "",
    `${CTA}: ${input.planUrl}`,
    "",
    legalNote(),
    `Termos de Uso: ${input.termsUrl}`,
    `Política de Privacidade: ${input.privacyUrl}`,
  ].join("\n");

  return sendEmail({
    to: input.ownerEmail,
    subject: SUBJECT,
    text,
    html: buildHtml(input, now),
    idempotencyKey: input.idempotencyKey,
  });
}
