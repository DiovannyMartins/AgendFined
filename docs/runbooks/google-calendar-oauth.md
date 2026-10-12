# Configuração do Google Calendar

## Visão geral

O AgendFined sincroniza reservas confirmadas em uma única direção: AgendFined → Google Calendar. A sincronização acontece imediatamente após criação ou cancelamento de uma reserva e também pelo scheduler de reconciliação, que funciona como rede de segurança.

O AgendFined não lê eventos existentes do Google Calendar. Ao desconectar, o acesso é revogado e a conexão local é removida; eventos que já foram criados no Google Calendar permanecem lá.

## Google Cloud

1. Crie ou selecione um projeto no [Google Cloud Console](https://console.cloud.google.com/).
2. Ative a Google Calendar API.
3. Configure a tela de consentimento OAuth para o tipo de usuário adequado ao projeto.
4. Crie um cliente OAuth do tipo **Aplicativo da Web**.
5. Adicione exatamente esta URI de redirecionamento em produção:

   `https://agendfined.com.br/api/google-calendar/callback`

   Para desenvolvimento local, use a URL correspondente ao `APP_URL` local.

O escopo solicitado é `https://www.googleapis.com/auth/calendar.events`. O fluxo usa acesso offline para que o scheduler possa renovar o token sem exigir novo login.

## Variáveis de ambiente

Configure as variáveis no ambiente de execução, nunca no repositório:

```text
GOOGLE_CALENDAR_CLIENT_ID=<client-id>.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=<client-secret>
GOOGLE_CALENDAR_REDIRECT_URI=https://agendfined.com.br/api/google-calendar/callback
GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY=<base64 de exatamente 32 bytes>
```

`GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` pode ser gerada com Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Depois de configurar as variáveis, faça um novo deploy e teste com uma conta do plano PROFISSIONAL:

1. Abra Configurações → Google Calendar.
2. Clique em Conectar Google Calendar e conclua o consentimento.
3. Crie uma reserva confirmada e verifique o evento no calendário principal.
4. Cancele a reserva e verifique a remoção do evento.
5. Use Sincronizar agora para validar a reconciliação manual.
