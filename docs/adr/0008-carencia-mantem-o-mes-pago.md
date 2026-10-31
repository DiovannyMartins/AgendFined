# 0008 — Carência do cancelamento mantém o mês já pago

**Status:** aceito

Quando a assinatura do PROFISSIONAL é interrompida, o negócio continua PROFISSIONAL durante uma carência, gravada em `subscriptions.grace_period_end`. O cron `downgrade_expired_subscriptions` volta o negócio ao Grátis quando ela passa, sem apagar dados. Até a issue #142, toda carência era de 7 dias a partir da interrupção. Quem pagava no dia 1 e cancelava no dia 2 perdia o PROFISSIONAL no dia 9, cerca de três semanas pagas e não usadas. Isso contraria a leitura natural de "Cancele quando quiser" e abre risco de reclamação, de chargeback e de questionamento pelo CDC.

Agora, no **cancelamento** de uma assinatura paga, a carência vai até `max(fim do período pago, agora + 7 dias)`. O fim do período pago é o `next_payment_date` da preapproval no Mercado Pago. Na **falha de pagamento** (`paused`), a carência continua de 7 dias, porque o mês seguinte não foi pago. O mesmo vale para um `cancelled` que chega depois de um `paused`: só uma assinatura ainda `authorized` no banco tem período pago a preservar. Uma carência já ativa nunca é encurtada nem recalculada por um webhook repetido. Ela abre uma vez só, quando a assinatura paga é interrompida: um `paused`/`cancelled` aplicado sobre uma linha já `paused`/`cancelled` mantém a carência gravada, mesmo vencida, para que reler o mesmo retrato não a reabra (issue #242). `snapshotGraceEnd` e `apply_subscription_snapshot` aplicam a mesma regra.

O cancelamento pelo painel lê a preapproval antes de cancelar e não usa o `current_period_end` local. O provider lia esse campo de `auto_recurring.end_date`, que o Mercado Pago não manda em assinatura sem prazo final, então as linhas antigas o têm nulo. Se a leitura falhar, nada é cancelado e o dono pode tentar de novo. Cancelar com só 7 dias seria repetir o erro em silêncio.

O retorno do checkout (`/api/billing/return`) pode ler a preapproval antes do webhook. Ele calcula a carência do mesmo jeito (`snapshotGraceEnd`), para nenhum `paused`/`cancelled` ficar sem carência e ser rebaixado pelo cron antes do webhook chegar. Cada retrato do Mercado Pago leva o `last_modified` do provedor, guardado em `subscriptions.provider_modified_at`. `apply_subscription_snapshot` ignora, sem erro, um retrato mais antigo que o guardado, para um `authorized` lido antes de uma pausa não limpar a carência depois dela. Sem `last_modified`, o retrato é aplicado como antes.

## Alternativas consideradas

- **Manter 7 dias em qualquer interrupção:** rejeitado pelos motivos acima. Era o comportamento documentado nos Termos até a #142.
- **Só o período pago, sem mínimo:** rejeitado. Quem cancela na véspera da renovação perderia o PROFISSIONAL no dia seguinte, sem tempo para exportar ou reativar.
- **Ler o `current_period_end` do banco:** rejeitado, porque ele é nulo nas linhas já gravadas.

## Fontes

- `lib/billing/grace.ts` — cálculo da carência
- `lib/billing/cancel-subscription.ts` — cancelamento pelo painel
- `lib/billing/handle-webhook.ts` — `paused`/`cancelled` vindos do Mercado Pago
- `lib/billing/return-sync.ts` — retorno do checkout antes do webhook
- `supabase/migrations/20261027020000_subscription_snapshot_ordering.sql` — cerca de ordem dos retratos
- `lib/billing/mercado-pago.ts` — `currentPeriodEnd` a partir de `next_payment_date`
- `app/termos/page.tsx` — seção 5
