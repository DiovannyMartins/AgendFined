# Configuração do Google Calendar

## Visão geral

O AgendFined sincroniza reservas confirmadas em uma única direção: AgendFined → Google Calendar. A sincronização acontece imediatamente após criação ou cancelamento de uma reserva e também pelo scheduler de reconciliação, que funciona como rede de segurança.

O evento só é removido quando a reserva é cancelada (ou deixa de existir). Reservas concluídas ou marcadas como no-show mantêm o evento como estava, para o histórico do proprietário no Google Calendar; o AgendFined não recria nem altera esses eventos.

O AgendFined não lê eventos existentes do Google Calendar. Ao desconectar, o acesso é revogado e a conexão local é removida; eventos que já foram criados no Google Calendar permanecem lá.

### Fusos horários

Cada negócio tem um fuso IANA próprio, com `America/Sao_Paulo` como padrão. A reserva é
convertida do horário local do negócio para um instante UTC; o mesmo fuso é usado no
site público, painel, lembretes, exportação e evento do Google Calendar.

Ao conectar, o sistema consulta automaticamente o fuso do calendário principal e o
guarda apenas como metadado. Se ele for diferente do fuso do negócio, Configurações
mostra um aviso. O proprietário pode alinhar os fusos pelo botão de configuração,
mas a alteração é bloqueada enquanto existirem reservas futuras confirmadas para
evitar deslocar horários já publicados. O botão só aparece quando o fuso do Google
Calendar é brasileiro, porque o negócio só aceita fusos do Brasil (#189). Não se deve
corrigir a diferença somando ou subtraindo uma hora manualmente.

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

## Verificação do app pelo Google

O escopo `calendar.events` é **sensível**. Enquanto o Google não verificar o uso dele:

- todo dono que conecta vê "O Google não verificou este app" e só segue por **Avançado → Acessar AgendFined (não seguro)**;
- na tela seguinte, a caixa "Ver e editar eventos em todas as suas agendas" vem desmarcada, e sem ela a conexão não tem acesso à agenda;
- o app aceita no máximo 100 usuários.

Em 24 de outubro de 2026, o projeto `agendfined` estava **Em produção**, com a marca (nome e logo) já verificada e o escopo sensível ainda não verificado. Uma autorização dada enquanto o app estava em **Teste** expira em 7 dias. Foi o que derrubou a sincronização do negócio de teste em 19/10.

### Pré-requisitos

1. **Verificação em duas etapas** na conta Google que administra o projeto. Desde 23 de outubro de 2026 o Google Cloud bloqueia as páginas de branding e de verificação sem ela.
2. **Domínio verificado no Google Search Console** (`agendfined.com.br`), na mesma conta que é proprietária ou editora do projeto.
3. Em **Google Auth Platform → Branding**:
   - página inicial `https://agendfined.com.br`;
   - política de privacidade `https://agendfined.com.br/privacidade`;
   - termos `https://agendfined.com.br/termos`;
   - domínio autorizado `agendfined.com.br`.
4. **Política de privacidade:** a seção 4 explica o acesso ao Google Calendar e declara a adesão ao Uso Limitado. O Google exige isso; não remova.
5. Em **Acesso a dados** (Data Access), só os escopos que o app pede: `openid`, `.../auth/userinfo.email` (não sensíveis) e `https://www.googleapis.com/auth/calendar.events` (sensível). Declarados em 24 de outubro de 2026. Sem eles a Central de verificação diz que "a verificação não é necessária" e não oferece o pedido, embora o app peça `calendar.events` ao conectar.

### Justificativa do escopo (colar em inglês no formulário)

O campo "Como os escopos serão usados?", em **Acesso a dados**, aceita no máximo **1000 caracteres**. O texto abaixo tem 920.

```text
AgendFined is an online booking platform for small service businesses in Brazil. On the paid plan, a business owner can click "Conectar Google Calendar" in Settings; AgendFined then creates one event in the owner's primary calendar for each confirmed booking (service, time, customer name, phone and note), updates it when the booking changes and deletes it when it is cancelled.

calendar.events is needed because the feature creates, updates and deletes events; read-only scopes cannot write, and the full calendar scope grants more than needed. Each event id is derived from the booking id, and the app only touches events it created; it never reads other events.

Tokens are encrypted at rest. Disconnecting revokes and deletes them. Google user data is not sold, used for ads or shared, and follows the Google API Services User Data Policy, including Limited Use (https://agendfined.com.br/privacidade, section 4).
```

Se o revisor perguntar por um escopo mais estreito, a alternativa é `.../auth/calendar.events.owned` ("Ver, criar, mudar e excluir eventos nas suas agendas do Google"), que basta para a agenda principal do dono. Trocar exige mudar o escopo em `lib/google-calendar/oauth.ts` e todos os donos reconectarem.

### Roteiro do vídeo de demonstração

Grave a tela, publique no YouTube como **Não listado** e cole o link no formulário. Os revisores do Google costumam pedir o vídeo em inglês; deixe o idioma da conta Google em inglês durante a gravação (ou acrescente `hl=en` à URL de consentimento).

1. Mostre `https://agendfined.com.br` e o link da política de privacidade.
2. Entre no painel com uma conta do plano PROFISSIONAL e abra **Configurações → Google Calendar**.
3. Clique em **Conectar Google Calendar**. Na tela do Google, mostre a **barra de endereço com o `client_id`**, o nome do app e a permissão "View and edit events on all your calendars". Marque a permissão e continue.
4. Volte ao AgendFined e mostre "Google Calendar conectado" com o e-mail da conta.
5. Faça uma reserva na página pública do negócio e mostre o evento aparecendo no Google Calendar.
6. Cancele a reserva e mostre o evento sumindo do Google Calendar.
7. Clique em **Desconectar** e mostre, em `myaccount.google.com/permissions`, que o AgendFined não tem mais acesso.

### Envio e acompanhamento

1. Em **Acesso a dados**, cole a justificativa e o link do vídeo e salve. Depois, em **Central de verificação**, clique em **Prepare for verification** e siga o assistente.
2. O Google responde nos e-mails de contato do desenvolvedor (`agendfined@outlook.com` e `diovannydev@gmail.com`), às vezes pedindo ajustes. Responda pela mesma thread.
3. Até a aprovação, o aviso continua aparecendo. Depois dela, confira o fluxo de conexão de novo: o aviso some e a permissão já vem marcada.
