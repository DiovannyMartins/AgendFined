# Operação de produção — AgendFined

Este documento reúne o procedimento repetível para publicar e verificar o AgendFined sem expor secrets. A URL oficial é `https://agendfined.com.br`.

## Verificação automática

Use Node 22+ e execute com as variáveis do ambiente que deseja verificar carregadas:

```bash
npm run check:launch -- --production
```

O script verifica a presença das variáveis, o formato dos endpoints, HTTPS, `robots.txt`, `sitemap.xml` e a CSP pública. Ele nunca imprime valores de secrets.

As verificações de variáveis leem o ambiente local, inclusive `.env.local`; não consultam as variáveis da Vercel nem o Supabase Vault. Um aviso local de segredo ausente não comprova falha em produção.

Para uma instância local:

```bash
CHECK_URL=http://localhost:3000 APP_URL=http://localhost:3000 npm run check:launch
```

## Vercel

1. Projeto: `agendfined`, domínio de produção: `agendfined.com.br`.
2. Configure as variáveis em **Settings → Environment Variables**, separando Production, Preview e Development quando necessário.
3. `NEXT_PUBLIC_*` pode chegar ao navegador; nunca coloque service role, tokens, webhooks ou secrets nesses nomes.
4. Depois de adicionar ou alterar uma variável, faça um novo deploy. A variável de Analytics usada no projeto é `NEXT_PUBLIC_GA_MEASUREMENT_ID`.
5. Em **Domains**, confirme o domínio principal, HTTPS e redirecionamento canônico.
6. Depois do deploy, rode `npm run check:launch -- --production` e faça uma visita manual à landing, cadastro, login e uma rota pública.
7. Configure `CRON_SECRET` e `RECONCILIATION_CRON_SECRET` como Secrets em Production. O scheduler de reconciliação está configurado no Supabase `pg_cron` com o job `billing-reconciliation` a cada 30 minutos; o mesmo segredo é mantido no Supabase Vault e enviado no header `Authorization: Bearer ...`. O Vercel Cron não é usado para essa rotina.

## Supabase

1. Em **Authentication → URL Configuration**, mantenha:
   - Site URL: `https://agendfined.com.br`
   - Redirect URLs: `https://agendfined.com.br/**` e `https://agendfined.com.br/auth/callback`
2. Mantenha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no client; `SUPABASE_SERVICE_ROLE_KEY` fica somente no servidor e nas Edge Functions.
3. Para migrations aprovadas, confira o diff e execute:

```bash
npx supabase db push --linked
```

4. Confirme que o cron/pg_net chama a Edge Function `booking-reminders` com `REMINDER_CRON_SECRET` e que a função possui `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` e `RESEND_FROM_EMAIL`.
5. Para a reconciliação, confirme no Vault os nomes `agendfined_reconciliation_cron_url` e `agendfined_reconciliation_cron_secret`, e no `cron.job` o schedule `*/30 * * * *` com `active = true`.
6. Não altere RLS, RPCs, cron ou secrets diretamente como parte de um deploy de frontend. Faça mudanças de banco em migration, revise-as e valide com os testes de integração usando Node 22+.

### Diagnóstico do scheduler

`process_billing_reconciliation()` usa timeout HTTP de 60 segundos. O status `succeeded` em `cron.job_run_details` confirma o disparo, não a conclusão HTTP. Consulte `net._http_response` pelo ID retornado pela função e verifique `status_code`, `timed_out` e `error_msg`. Uma resposta 200 deve conter `ok: true`; verifique também `calendarSync.failed`, pois erros de calendário não tornam a resposta HTTP um erro.

O teste `tests/sql/reconciliation-scheduler.sql` verifica a requisição real enfileirada e reverte a transação antes do envio. Execute com `npx supabase db query --linked --file tests/sql/reconciliation-scheduler.sql`. Ele exige a URL e o segredo já configurados no Vault e não revela seus valores.

## Mercado Pago

1. Use o Access Token de produção (`APP_USR-*`) em `MERCADO_PAGO_ACCESS_TOKEN`; não use token `TEST-*` no lançamento.
2. Configure a notificação de assinaturas/preapproval para:
   `https://agendfined.com.br/api/webhooks/mercadopago`
3. Mantenha `MERCADO_PAGO_WEBHOOK_SECRET` configurado e valide a assinatura recebida pelo handler.
4. Confira o valor server-side em `MERCADO_PAGO_PRO_AMOUNT_CENTS`.
5. O fluxo de assinatura deve ser validado com uma conta de teste adequada antes de qualquer cobrança real. Os scripts existentes são `scripts/setup-mercadopago.sh` e `scripts/setup-mercadopago-prod.sh`.
6. Quando uma assinatura é autorizada, o webhook cancela os outros checkouts pendentes do negócio. Se o cliente pagou dois checkouts, o extra é cancelado e o log da Vercel registra o evento `billing_double_charge` com `businessId` e `mpPreapprovalId`. A cobrança já feita nesse checkout precisa ser estornada manualmente no painel do Mercado Pago.
7. Um checkout guarda o preço de quando foi criado. A cada execução do cron de reconciliação, os checkouts pendentes com valor diferente de `MERCADO_PAGO_PRO_AMOUNT_CENTS` têm o valor atualizado no Mercado Pago (até 20 por execução; se o Mercado Pago recusar, o checkout é cancelado). A resposta da rota traz o resumo em `repricing`. Se ainda assim um checkout for pago abaixo do preço atual, ele não ativa o PROFISSIONAL: é cancelado e o log registra `billing_stale_price_charge` para estorno manual. Quem já assinava por um preço anterior continua renovando por ele.

## Resend

1. Confirme o domínio `agendfined.com.br` autenticado no Resend (SPF/DKIM/DMARC conforme o painel).
2. Use `RESEND_API_KEY` somente no servidor e nas Edge Functions.
3. Use `RESEND_FROM_EMAIL="AgendFined <reservas@agendfined.com.br>"` para confirmações e lembretes.
4. O suporte ao cliente é separado: `agendfined@outlook.com`.
5. Confirme no log do Resend uma confirmação e um lembrete entregues. O script `scripts/configure-booking-reminders.sh` orienta a configuração do envio e do cron.

## Smoke test pós-deploy

- Landing: título, descrição, CTA de cadastro, links de navegação, suporte e rodapé.
- Auth: cadastro, confirmação de e-mail, login, MFA quando habilitado e logout.
- Público: abrir slug, carregar serviços/horários, reservar, consultar e cancelar.
- Operação: confirmação e lembrete recebidos; webhook de assinatura respondendo sem erro.
- Indexação: `robots.txt`, `sitemap.xml`, canonical da home e `noindex` em login, dashboard, consulta e confirmação.
- Desktop e mobile: sem overflow horizontal, foco visível, labels associados e mensagens de erro legíveis.

## Rollback

Se um deploy quebrar um fluxo crítico, interrompa a divulgação, marque o deployment anterior estável na Vercel e registre o incidente. Não faça rollback de banco sem avaliar a compatibilidade das migrations já aplicadas.
