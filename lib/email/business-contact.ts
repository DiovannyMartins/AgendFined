import { escapeHtml } from "@/lib/email/resend";
import { formatPhoneBR, phoneTelHref, whatsappHref } from "@/lib/format/phone";

// The negócio's phone in the reserva e-mails, so "fale diretamente com" comes
// with a way to do it (#149). Rendered as rows of the details table; empty when
// the negócio has no phone.
export function businessContactRowsHtml(phone: string | null | undefined): string {
  if (!phone?.trim()) return "";
  const shown = escapeHtml(formatPhoneBR(phone));
  const tel = phoneTelHref(phone);
  const whatsapp = whatsappHref(phone);
  const linkStyle = "color:#eeeeee;text-decoration:underline;";
  const number = tel ? `<a href="${escapeHtml(tel)}" style="${linkStyle}">${shown}</a>` : shown;
  const chat = whatsapp
    ? ` · <a href="${escapeHtml(whatsapp)}" style="${linkStyle}">WhatsApp</a>`
    : "";

  return `
                  <tr>
                    <td style="padding:0 20px 8px;color:#b0b0b0;font-size:12px;line-height:18px;">TELEFONE DO NEGÓCIO</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 16px;color:#eeeeee;font-size:16px;font-weight:700;line-height:22px;">${number}${chat}</td>
                  </tr>`;
}

export function businessContactTextLines(phone: string | null | undefined): string[] {
  if (!phone?.trim()) return [];
  const whatsapp = whatsappHref(phone);
  return [
    `Telefone do negócio: ${formatPhoneBR(phone)}`,
    ...(whatsapp ? [`WhatsApp: ${whatsapp}`] : []),
  ];
}
