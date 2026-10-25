type ReminderCandidate = {
  business_name: string;
  customer_name_snapshot: string;
  customer_email_snapshot: string;
  service_name_snapshot: string;
  start_at: string;
  public_code: string;
  business_timezone?: string;
  business_slug?: string;
  business_phone?: string | null;
};

export type ReminderEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

function formatWhen(iso: string, timezone = "America/Sao_Paulo"): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).formatToParts(new Date(iso));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")}/${value("month")}/${value("year")} às ${value("hour")}:${value("minute")}`;
}

// Deno twin of formatWhenWithTimezone (lib/format/when.ts), which this function
// cannot import: "20/10/2026 às 10:00 (horário de Manaus, UTC−4)".
const TIMEZONE_CITY: Record<string, string | null> = {
  "America/Sao_Paulo": "Brasília",
  "America/Cuiaba": "Cuiabá",
  "America/Manaus": "Manaus",
  "America/Rio_Branco": "Rio Branco",
  "America/Noronha": "Fernando de Noronha",
  UTC: null,
  "Europe/Lisbon": "Lisboa",
  "America/New_York": "Nova York",
};

function formatWhenWithTimezone(iso: string, timezone = "America/Sao_Paulo"): string {
  const offset = (
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" })
      .formatToParts(new Date(iso))
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT"
  )
    .replace(/^GMT(?:[+-]0)?$/, "GMT")
    .replace("GMT", "UTC")
    .replace("-", "−");
  const fallbackCity = timezone.includes("/") ? (timezone.split("/").pop() ?? "").replaceAll("_", " ") : null;
  const city = timezone in TIMEZONE_CITY ? TIMEZONE_CITY[timezone] : fallbackCity || null;
  return `${formatWhen(iso, timezone)} (${city ? `horário de ${city}, ${offset}` : offset})`;
}

// Deno twin of formatPublicCode (lib/bookings/public-code.ts): stored without
// the hyphen, shown grouped as on screen, 22AP-MB04 (#149).
function formatPublicCode(code: string): string {
  const normalized = code.replace(/[\s-]/g, "").toUpperCase();
  return normalized.length === 8 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : code;
}

// Deno twins of formatPhoneBR / phoneTelHref / whatsappHref (lib/format/phone.ts).
// Business phones are stored as national digits (DDD + número).
function nationalPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const national = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
  return national.length === 10 || national.length === 11 ? national : null;
}

function formatPhoneBR(national: string): string {
  const split = national.length - 4;
  return `(${national.slice(0, 2)}) ${national.slice(2, split)}-${national.slice(split)}`;
}

// The reminder is when the cliente most often cancels or reschedules (#149), so
// it links to the consulta and says how to reach the negócio. `appOrigin` is
// the app's public origin, e.g. https://agendfined.com.br.
export function buildReminderEmail(candidate: ReminderCandidate, appOrigin?: string): ReminderEmail {
  const when = formatWhenWithTimezone(candidate.start_at, candidate.business_timezone);
  const customerName = escapeHtml(candidate.customer_name_snapshot);
  const businessName = escapeHtml(candidate.business_name);
  const serviceName = escapeHtml(candidate.service_name_snapshot);
  const dateAndTime = escapeHtml(when);
  const code = formatPublicCode(candidate.public_code);
  const publicCode = escapeHtml(code);

  const consultUrl = appOrigin && candidate.business_slug
    ? new URL(`/${encodeURIComponent(candidate.business_slug)}/consultar`, appOrigin).toString()
    : null;
  const national = candidate.business_phone ? nationalPhone(candidate.business_phone) : null;
  const phoneShown = national ? formatPhoneBR(national) : candidate.business_phone?.trim() || null;
  const whatsappUrl = national?.length === 11 ? `https://wa.me/55${national}` : null;

  const linkStyle = "color:#eeeeee;text-decoration:underline;";
  const phoneRowsHtml = phoneShown
    ? `
                  <tr>
                    <td style="padding:0 20px 8px;color:#b0b0b0;font-size:12px;line-height:18px;">TELEFONE DO NEGÓCIO</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 16px;color:#eeeeee;font-size:16px;font-weight:700;line-height:22px;">${
                      national ? `<a href="tel:+55${national}" style="${linkStyle}">${escapeHtml(phoneShown)}</a>` : escapeHtml(phoneShown)
                    }${whatsappUrl ? ` · <a href="${whatsappUrl}" style="${linkStyle}">WhatsApp</a>` : ""}</td>
                  </tr>`
    : "";
  const consultHtml = consultUrl
    ? `
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-collapse:collapse;">
                  <tr>
                    <td style="border-radius:8px;background-color:#ffffff;">
                      <a href="${escapeHtml(consultUrl)}" style="display:inline-block;padding:12px 18px;color:#111111;font-size:14px;font-weight:700;text-decoration:none;">Consultar reserva</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0;color:#b0b0b0;font-size:14px;line-height:22px;">Para cancelar, use o link privado do e-mail de confirmação${phoneShown ? " ou fale com o negócio pelo telefone acima" : ""}.</p>`
    : "";

  return {
    to: candidate.customer_email_snapshot,
    subject: `Lembrete: seu horário está confirmado — ${candidate.business_name}`,
    text: [
      `Olá ${candidate.customer_name_snapshot}!`,
      "",
      `Este é um lembrete da sua reserva confirmada em ${candidate.business_name}.`,
      ...(phoneShown ? [`Telefone do negócio: ${phoneShown}`] : []),
      ...(whatsappUrl ? [`WhatsApp: ${whatsappUrl}`] : []),
      `Serviço: ${candidate.service_name_snapshot}`,
      `Data e horário: ${when}`,
      `Código da reserva: ${code}`,
      ...(consultUrl
        ? [
            "",
            `Consultar reserva: ${consultUrl}`,
            `Para cancelar, use o link privado do e-mail de confirmação${phoneShown ? " ou fale com o negócio" : ""}.`,
          ]
        : []),
      "",
      "Aguardamos você!",
    ].join("\n"),
    html: `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lembrete da sua reserva</title>
  </head>
  <body style="margin:0;background-color:#141414;color:#eeeeee;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#141414;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border:1px solid #333333;border-radius:12px;border-collapse:separate;background-color:#1c1c1c;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 22px;border-bottom:1px solid #333333;">
                <img src="https://agendfined.com.br/brand/email-logo.png" width="160" height="30" alt="AgendFined" style="display:block;width:160px;height:30px;border:0;outline:none;text-decoration:none;color:#eeeeee;font-size:17px;font-weight:700;line-height:30px;">
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 32px;">
                <p style="margin:0 0 12px;color:#b0b0b0;font-size:13px;line-height:20px;">LEMBRETE DE RESERVA</p>
                <h1 style="margin:0;color:#eeeeee;font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.6px;">Seu horário está chegando.</h1>
                <p style="margin:16px 0 0;color:#b0b0b0;font-size:16px;line-height:25px;">Olá, ${customerName}! Este é um lembrete da sua reserva confirmada.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:28px;border:1px solid #333333;border-radius:9px;border-collapse:separate;background-color:#242424;">
                  <tr>
                    <td style="padding:18px 20px 8px;color:#b0b0b0;font-size:12px;line-height:18px;">NEGÓCIO</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 16px;color:#eeeeee;font-size:16px;font-weight:700;line-height:22px;">${businessName}</td>
                  </tr>${phoneRowsHtml}
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
                    <td style="padding:0 20px 16px;color:#eeeeee;font-size:16px;font-weight:700;line-height:22px;">${dateAndTime}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 8px;color:#b0b0b0;font-size:12px;line-height:18px;">CÓDIGO DA RESERVA</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 19px;color:#ffffff;font-size:17px;font-weight:700;letter-spacing:1.4px;line-height:22px;">${publicCode}</td>
                  </tr>
                </table>
${consultHtml}
                <p style="margin:26px 0 0;color:#b0b0b0;font-size:14px;line-height:22px;">Aguardamos você! Guarde este e-mail para consultar os dados da reserva.</p>
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
</html>`,
  };
}
