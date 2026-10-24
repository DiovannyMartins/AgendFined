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

4. Confirme que o cron/pg_net chama a Edge Function `booking-reminders` com `REMINDER_CRON_SECRET` e que a função possui `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` e `RESEND_FROM_EMAIL`. O `npm run check:launch -- --production` confere isso por `get_booking_reminders_health()` (veja "Diagnóstico dos lembretes").
5. Para a reconciliação, confirme no Vault os nomes `agendfined_reconciliation_cron_url` e `agendfined_reconciliation_cron_secret`, e no `cron.job` o schedule `*/30 * * * *` com `active = true`.
6. Confirme no `cron.job` que `subscription-grace-downgrade` (rebaixa para o Grátis quem passou da carência), `booking-reminders` e `billing-reconciliation` existem com `*/30 * * * *` e `active = true`. O teste `tests/sql/cron-jobs.sql` faz essa checagem no Supabase local e roda no CI.
7. Não altere RLS, RPCs, cron ou secrets diretamente como parte de um deploy de frontend. Faça mudanças de banco em migration, revise-as e valide com os testes de integração usando Node 22+.

### Diagnóstico do scheduler

`process_billing_reconciliation()` usa timeout HTTP de 60 segundos. O status `succeeded` em `cron.job_run_details` confirma o disparo, não a conclusão HTTP. Consulte `net._http_response` pelo ID retornado pela função e verifique `status_code`, `timed_out` e `error_msg`. Uma resposta 200 deve conter `ok: true`; verifique também `calendarSync.failed`, pois erros de calendário não tornam a resposta HTTP um erro.

O teste `tests/sql/reconciliation-scheduler.sql` verifica a requisição real enfileirada e reverte a transação antes do envio. Execute com `npx supabase db query --linked --file tests/sql/reconciliation-scheduler.sql`. Ele exige a URL e o segredo já configurados no Vault e não revela seus valores.

### Diagnóstico dos lembretes

O job `booking-reminders` define `app.reminder_cron_url` e `app.reminder_cron_secret` no próprio comando antes de chamar `process_booking_reminders()`. Como o `pg_net` é assíncrono, `succeeded` em `cron.job_run_details` não prova o envio: até o #154 a URL de produção tinha um `\r` (vindo de um `.env.local` com CRLF) e nenhum lembrete saiu por semanas. Hoje uma URL com espaço ou caractere de controle faz o tick falhar com `booking_reminders: invalid cron url`.

Para conferir sem expor o segredo:

```bash
npx supabase db query --linked "select public.get_booking_reminders_health();"
```

Espere `job_active`, `dispatch_configured` e `url_valid` iguais a `true` e `missed_reminders_7d = 0` (reservas que ainda aconteceram, foram reservadas para envio e nunca receberam o lembrete). O `npm run check:launch -- --production` falha em qualquer desvio. Para corrigir a configuração, rode `scripts/configure-booking-reminders.sh`; nunca leia `cron.job.command`, que contém o segredo.

### Telefone do cliente

A migration `20261017030000_normalize_customer_phones.sql` grava os telefones de `customers` e `waitlist_entries` na forma canônica do #81 (só dígitos, DDD + número) e junta os clientes e entradas da lista de espera que passam a ter o mesmo telefone. Faça o deploy do código do #81 antes ou junto com a migration. Se reservas ou entradas da lista de espera forem gravadas no formato antigo entre a migration e o deploy, rode de novo no SQL Editor:

```sql
select private.normalize_customer_phones();
```

A função devolve quantos telefones foram normalizados, quantas linhas foram juntadas e quantos telefones não normalizam (esses ficam como estão). O teste `tests/sql/normalize-customer-phones.sql` roda só no Supabase local, dentro de uma transação revertida.

## Mercado Pago

1. Use o Access Token de produção (`APP_USR-*`) em `MERCADO_PAGO_ACCESS_TOKEN`; não use token `TEST-*` no lançamento.
2. Configure a notificação de assinaturas/preapproval para:
   `https://agendfined.com.br/api/webhooks/mercadopago`
3. Mantenha `MERCADO_PAGO_WEBHOOK_SECRET` configurado e valide a assinatura recebida pelo handler.
4. Confira o valor server-side em `MERCADO_PAGO_PRO_AMOUNT_CENTS`.
5. O fluxo de assinatura deve ser validado com uma conta de teste adequada antes de qualquer cobrança real. Os scripts existentes são `scripts/setup-mercadopago.sh` e `scripts/setup-mercadopago-prod.sh`.
6. Quando uma assinatura é autorizada, o webhook cancela os outros checkouts pendentes do negócio. Se o cliente pagou dois checkouts, o extra é cancelado e o log da Vercel registra o evento `billing_double_charge` com `businessId` e `mpPreapprovalId`. A cobrança já feita nesse checkout precisa ser estornada manualmente no painel do Mercado Pago.
7. Um checkout guarda o preço de quando foi criado. A cada execução do cron de reconciliação, os checkouts pendentes com valor diferente de `MERCADO_PAGO_PRO_AMOUNT_CENTS` têm o valor atualizado no Mercado Pago (até 20 por execução; se o Mercado Pago recusar, o checkout é cancelado; se a resposta não chegar em 10 segundos, o checkout fica para a próxima execução). A resposta da rota traz o resumo em `repricing`. Se ainda assim um checkout for pago abaixo do preço atual, ele não ativa o PROFISSIONAL: é cancelado e o log registra `billing_stale_price_charge` para estorno manual. A recusa vale para todo caminho que aplica a primeira autorização: o webhook, o retorno do checkout e a reconciliação. Quem já assinava por um preço anterior continua renovando por ele.
8. Pelo mesmo caminho, uma primeira autorização com moeda diferente de BRL ou cobrança que não seja mensal não ativa o PROFISSIONAL: o checkout é cancelado e o log registra `billing_unexpected_terms_charge` para estorno manual. Uma resposta do Mercado Pago sobre um checkout diferente do consultado é recusada, e o webhook ou o cron tentam de novo.
9. O Mercado Pago recusa `back_url` que não seja HTTPS público ("Invalid value for back_url, must be a valid URL"). O `back_url` e o retorno do checkout usam `APP_URL`, então testar o checkout real a partir de `localhost` exige um túnel HTTPS (com `APP_URL` apontando para ele) ou um deploy de preview.
10. Quando o Mercado Pago pausa uma assinatura por cobrança recusada, o webhook manda ao dono o e-mail "Não conseguimos cobrar a sua assinatura" com a data do fim da carência, e o painel mostra um aviso até ela acabar. Uma falha no envio só gera o log `payment_failed_email_failed`; a carência continua registrada.

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
