import { formatWhen } from "@/lib/format/when";

type BookingConfirmation = {
  customerName: string;
  customerEmail: string;
  businessName: string;
  serviceName: string;
  startAt: string;
  publicCode: string;
  confirmationUrl: string;
};

type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "provider_error" };

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

function buildBookingConfirmationHtml(input: BookingConfirmation, formattedWhen: string): string {
  const customerName = escapeHtml(input.customerName);
  const businessName = escapeHtml(input.businessName);
  const serviceName = escapeHtml(input.serviceName);
  const publicCode = escapeHtml(input.publicCode);
  const confirmationUrl = escapeHtml(input.confirmationUrl);
  const dateAndTime = escapeHtml(formattedWhen);

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sua reserva foi confirmada</title>
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
                <p style="margin:0 0 12px;color:#b0b0b0;font-size:13px;line-height:20px;">CONFIRMAÇÃO DE RESERVA</p>
                <h1 style="margin:0;color:#eeeeee;font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.6px;">Sua reserva está confirmada.</h1>
                <p style="margin:16px 0 0;color:#b0b0b0;font-size:16px;line-height:25px;">Olá, ${customerName}! Seu horário foi reservado com sucesso.</p>

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

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-collapse:collapse;">
                  <tr>
                    <td style="border-radius:8px;background-color:#ffffff;">
                      <a href="${confirmationUrl}" style="display:inline-block;padding:12px 18px;color:#111111;font-size:14px;font-weight:700;text-decoration:none;">Abrir confirmação privada</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0;color:#b0b0b0;font-size:14px;line-height:22px;">Guarde este e-mail. O link privado permite consultar e cancelar a reserva.</p>
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

export async function sendBookingConfirmationEmail(input: BookingConfirmation): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, reason: "not_configured" };

  const formattedWhen = formatWhen(input.startAt);
  const text = [
    `Olá, ${input.customerName}!`,
    "",
    "Sua reserva está confirmada.",
    `Negócio: ${input.businessName}`,
    `Serviço: ${input.serviceName}`,
    `Data e horário: ${formattedWhen}`,
    `Código da reserva: ${input.publicCode}`,
    `Confirmação privada: ${input.confirmationUrl}`,
    "",
    "Guarde este e-mail. O link privado permite consultar e cancelar a reserva.",
  ].join("\n");
  const html = buildBookingConfirmationHtml(input, formattedWhen);

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
        html,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok ? { sent: true } : { sent: false, reason: "provider_error" };
  } catch {
    return { sent: false, reason: "provider_error" };
  }
}
