type ReminderCandidate = {
  business_name: string;
  customer_name_snapshot: string;
  customer_email_snapshot: string;
  service_name_snapshot: string;
  start_at: string;
  public_code: string;
  business_timezone?: string;
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

export function buildReminderEmail(candidate: ReminderCandidate): ReminderEmail {
  const when = formatWhenWithTimezone(candidate.start_at, candidate.business_timezone);
  const customerName = escapeHtml(candidate.customer_name_snapshot);
  const businessName = escapeHtml(candidate.business_name);
  const serviceName = escapeHtml(candidate.service_name_snapshot);
  const dateAndTime = escapeHtml(when);
  const publicCode = escapeHtml(candidate.public_code);

  return {
    to: candidate.customer_email_snapshot,
    subject: `Lembrete: seu horário está confirmado — ${candidate.business_name}`,
    text: [
      `Olá ${candidate.customer_name_snapshot}!`,
      "",
      `Este é um lembrete da sua reserva confirmada em ${candidate.business_name}.`,
      `Serviço: ${candidate.service_name_snapshot}`,
      `Data e horário: ${when}`,
      `Código da reserva: ${candidate.public_code}`,
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
                <p style="margin:0 0 12px;color:#b0b0b0;font-size:13px;line-height:20px;">LEMBRETE DE RESERVA</p>
                <h1 style="margin:0;color:#eeeeee;font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.6px;">Seu horário está chegando.</h1>
                <p style="margin:16px 0 0;color:#b0b0b0;font-size:16px;line-height:25px;">Olá, ${customerName}! Este é um lembrete da sua reserva confirmada.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:28px;border:1px solid #333333;border-radius:9px;border-collapse:separate;background-color:#242424;">
                  <tr>
                    <td style="padding:18px 20px 8px;color:#b0b0b0;font-size:12px;line-height:18px;">NEGÓCIO</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 16px;color:#eeeeee;font-size:16px;font-weight:700;line-height:22px;">${businessName}</td>
                  </tr>
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
