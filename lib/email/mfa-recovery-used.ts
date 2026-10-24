import { escapeHtml, sendEmail, type SendResult } from "@/lib/email/resend";

// Sent to the dono when a código de recuperação switched off the second factor
// (issue #169, ADR 0009). Like the password-changed notice (#149), it lets the
// dono notice a takeover: whoever used the code also knew the password.
type MfaRecoveryUsedEmail = {
  ownerEmail: string;
  mfaUrl: string;
};

const SUBJECT = "Um código de recuperação foi usado na sua conta";
const BODY =
  "Alguém entrou na conta com a senha e um código de recuperação, e a autenticação em duas etapas foi desativada. Ative um novo autenticador para proteger a conta outra vez.";
const IF_NOT_YOU =
  "Se não foi você, redefina a senha agora pelo link \"Esqueceu a senha?\" na tela de login e ative um novo autenticador.";

function buildMfaRecoveryUsedHtml(input: MfaRecoveryUsedEmail): string {
  const mfaUrl = escapeHtml(input.mfaUrl);

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
                <p style="margin:0 0 12px;color:#b0b0b0;font-size:13px;line-height:20px;">SEGURANÇA DA CONTA</p>
                <h1 style="margin:0;color:#eeeeee;font-size:28px;font-weight:700;line-height:36px;letter-spacing:-0.6px;">${SUBJECT}.</h1>
                <p style="margin:16px 0 0;color:#b0b0b0;font-size:16px;line-height:25px;">${escapeHtml(BODY)}</p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;border-collapse:collapse;">
                  <tr>
                    <td style="border-radius:8px;background-color:#ffffff;">
                      <a href="${mfaUrl}" style="display:inline-block;padding:12px 18px;color:#111111;font-size:14px;font-weight:700;text-decoration:none;">Ativar novo autenticador</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;color:#b0b0b0;font-size:14px;line-height:22px;">${escapeHtml(IF_NOT_YOU)}</p>
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

export function sendMfaRecoveryUsedEmail(input: MfaRecoveryUsedEmail): Promise<SendResult> {
  const text = [
    `${SUBJECT}.`,
    "",
    BODY,
    "",
    `Ativar novo autenticador: ${input.mfaUrl}`,
    "",
    IF_NOT_YOU,
  ].join("\n");

  return sendEmail({ to: input.ownerEmail, subject: SUBJECT, text, html: buildMfaRecoveryUsedHtml(input) });
}
