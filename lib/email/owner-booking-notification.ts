import { formatPublicCode } from "@/lib/bookings/public-code";
import { escapeHtml, sendEmail, type SendResult } from "@/lib/email/resend";
import { formatPhoneBR } from "@/lib/format/phone";
import { formatWhen, formatWhenWithTimezone } from "@/lib/format/when";

// Sent to the dono (the e-mail of the account that owns the negócio) when a
// cliente reserves, cancels or reschedules through the public page (#146,
// #194). It carries what
// the dono needs to act without opening the painel (who, what, when and the
// phone to call back) and a link to the agenda, never the cliente's cancel
// token, private link or cancel reason.
type OwnerBookingNotification = {
  ownerEmail: string;
  businessName: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  startAt: string;
  timezone: string;
  publicCode: string;
  // What the cliente wrote when booking (alergia, acessibilidade, preferência)
  // and whether it needs reading before the atendimento, as the agenda shows (#179).
  customerNote?: string | null;
  customerNoteRequiresFollowUp?: boolean;
  // Set for a remarcação: startAt is the new horário and this the freed one.
  previousStartAt?: string;
  agendaUrl: string;
};

const NOTE_ATTENTION = "Leia a observação antes do atendimento.";

type Wording = {
  label: string;
  subject: string;
  heading: string;
  intro: (customerName: string, businessName: string) => string;
  strikeWhen: boolean;
};

const NEW_BOOKING: Wording = {
  label: "NOVA RESERVA",
  subject: "Nova reserva",
  heading: "Você tem uma nova reserva.",
  intro: (customerName, businessName) => `${customerName} fez uma reserva em ${businessName}.`,
  strikeWhen: false,
};

const CUSTOMER_CANCELLED: Wording = {
  label: "RESERVA CANCELADA PELO CLIENTE",
  subject: "Reserva cancelada",
  heading: "Uma reserva foi cancelada.",
  intro: (customerName, businessName) =>
    `${customerName} cancelou a reserva em ${businessName}. O horário foi liberado.`,
  strikeWhen: true,
};

const CUSTOMER_RESCHEDULED: Wording = {
  label: "RESERVA REMARCADA PELO CLIENTE",
  subject: "Reserva remarcada",
  heading: "Uma reserva foi remarcada.",
  intro: (customerName, businessName) =>
    `${customerName} remarcou a reserva em ${businessName}. O horário anterior foi liberado.`,
  strikeWhen: false,
};

function detailRows(rows: [label: string, value: string, style?: string][]): string {
  return rows
    .map(
      ([label, value, style = ""], index) => `                  <tr>
                    <td style="padding:${index === 0 ? "18px" : "0"} 20px 8px;color:#b0b0b0;font-size:12px;line-height:18px;">${label}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px ${index === rows.length - 1 ? "19px" : "16px"};color:#eeeeee;font-size:16px;font-weight:700;line-height:22px;${style}">${value}</td>
                  </tr>`,
    )
    .join("\n");
}

function whenRows(
  input: OwnerBookingNotification,
  wording: Wording,
  formattedWhen: string,
): [label: string, value: string, style?: string][] {
  if (!input.previousStartAt) {
    return [["DATA E HORÁRIO", escapeHtml(formattedWhen), wording.strikeWhen ? "text-decoration:line-through;" : ""]];
  }
  return [
    ["NOVO HORÁRIO", escapeHtml(formattedWhen)],
    [
      "HORÁRIO ANTERIOR",
      escapeHtml(formatWhenWithTimezone(input.previousStartAt, input.timezone)),
      "color:#b0b0b0;font-weight:400;text-decoration:line-through;",
    ],
  ];
}

function noteRow(input: OwnerBookingNotification): [label: string, value: string, style?: string][] {
  const note = input.customerNote?.trim();
  if (!note) return [];
  const attention = input.customerNoteRequiresFollowUp
    ? `<span style="display:block;margin-bottom:6px;color:#f5b041;font-size:13px;font-weight:700;">${NOTE_ATTENTION}</span>`
    : "";
  return [["OBSERVAÇÃO", `${attention}${escapeHtml(note).replace(/\r?\n/g, "<br>")}`, "font-weight:400;"]];
}

function buildOwnerNotificationHtml(
  input: OwnerBookingNotification,
  wording: Wording,
  formattedWhen: string,
): string {
  const customerName = escapeHtml(input.customerName);
  const businessName = escapeHtml(input.businessName);
  const agendaUrl = escapeHtml(input.agendaUrl);

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
                <p style="margin:0 0 12px;color:#b0b0b0;font-size:13px;line-height:20px;">${wording.label}</p>
                <h1 style="margin:0;color:#eeeeee;font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.6px;">${escapeHtml(wording.heading)}</h1>
                <p style="margin:16px 0 0;color:#b0b0b0;font-size:16px;line-height:25px;">${wording.intro(customerName, businessName)}</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:28px;border:1px solid #333333;border-radius:9px;border-collapse:separate;background-color:#242424;">
${detailRows([
  ["CLIENTE", customerName],
  ["TELEFONE", escapeHtml(formatPhoneBR(input.customerPhone))],
  ["SERVIÇO", escapeHtml(input.serviceName)],
  ...whenRows(input, wording, formattedWhen),
  ["CÓDIGO DA RESERVA", escapeHtml(formatPublicCode(input.publicCode)), "color:#ffffff;font-size:17px;letter-spacing:1.4px;"],
  ...noteRow(input),
])}
                </table>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-collapse:collapse;">
                  <tr>
                    <td style="border-radius:8px;background-color:#ffffff;">
                      <a href="${agendaUrl}" style="display:inline-block;padding:12px 18px;color:#111111;font-size:14px;font-weight:700;text-decoration:none;">Abrir agenda</a>
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

async function sendOwnerNotification(input: OwnerBookingNotification, wording: Wording): Promise<SendResult> {
  const formattedWhen = formatWhenWithTimezone(input.startAt, input.timezone);
  const note = input.customerNote?.trim();
  const text = [
    wording.heading,
    "",
    wording.intro(input.customerName, input.businessName),
    `Cliente: ${input.customerName}`,
    `Telefone: ${formatPhoneBR(input.customerPhone)}`,
    `Serviço: ${input.serviceName}`,
    ...(input.previousStartAt
      ? [
          `Novo horário: ${formattedWhen}`,
          `Horário anterior: ${formatWhenWithTimezone(input.previousStartAt, input.timezone)}`,
        ]
      : [`Data e horário: ${formattedWhen}`]),
    `Código da reserva: ${formatPublicCode(input.publicCode)}`,
    ...(note ? [`Observação: ${note}`, ...(input.customerNoteRequiresFollowUp ? [NOTE_ATTENTION] : [])] : []),
    "",
    `Abrir agenda: ${input.agendaUrl}`,
  ].join("\n");
  const html = buildOwnerNotificationHtml(input, wording, formattedWhen);
  const subject = `${wording.subject}: ${input.customerName}, ${formatWhen(input.startAt, input.timezone)}`;

  return sendEmail({ to: input.ownerEmail, subject, text, html });
}

export function sendOwnerNewBookingEmail(input: OwnerBookingNotification): Promise<SendResult> {
  return sendOwnerNotification(input, NEW_BOOKING);
}

export function sendOwnerCustomerCancelledEmail(input: OwnerBookingNotification): Promise<SendResult> {
  return sendOwnerNotification(input, CUSTOMER_CANCELLED);
}

export function sendOwnerCustomerRescheduledEmail(input: OwnerBookingNotification): Promise<SendResult> {
  return sendOwnerNotification(input, CUSTOMER_RESCHEDULED);
}
