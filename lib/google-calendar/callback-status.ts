// Results the connect/callback routes send back to Configurações as
// ?calendar=<status>. Every status needs a pt-BR notice, enforced by the Record.
export type GoogleCalendarCallbackStatus =
  | "connected"
  | "cancelled"
  | "invalid_state"
  | "unauthorized"
  | "upgrade_required"
  | "not_configured"
  | "missing_email"
  | "missing_refresh_token"
  | "connection_failed";

export type GoogleCalendarCallbackNotice = { tone: "success" | "info" | "error"; message: string };

const NOTICES: Record<GoogleCalendarCallbackStatus, GoogleCalendarCallbackNotice> = {
  connected: { tone: "success", message: "Google Calendar conectado. As reservas confirmadas futuras serão sincronizadas." },
  cancelled: { tone: "info", message: "Você cancelou a conexão no Google. Nada foi alterado." },
  invalid_state: { tone: "error", message: "Não foi possível validar a conexão com o Google. Tente conectar novamente." },
  unauthorized: { tone: "error", message: "Entre com a conta do negócio no plano PROFISSIONAL para conectar o Google Calendar." },
  upgrade_required: { tone: "error", message: "A sincronização com o Google Calendar está disponível no plano PROFISSIONAL." },
  not_configured: { tone: "error", message: "A integração com o Google Calendar ainda não está configurada. Tente novamente mais tarde." },
  missing_email: { tone: "error", message: "O Google não informou o e-mail da conta. Conecte novamente e autorize o acesso ao e-mail." },
  missing_refresh_token: { tone: "error", message: "O Google não concedeu acesso contínuo. Remova o acesso do AgendFined na sua Conta Google e conecte novamente." },
  connection_failed: { tone: "error", message: "Não foi possível concluir a conexão com o Google Calendar. Tente novamente." },
};

export function googleCalendarCallbackNotice(status: string | null | undefined): GoogleCalendarCallbackNotice | null {
  return status && Object.hasOwn(NOTICES, status) ? NOTICES[status as GoogleCalendarCallbackStatus] : null;
}
