# 0013 — Plano único, teste grátis de 30 dias e negócio suspenso

**Status:** aceito

Até aqui o AgendFined tinha dois planos: o Grátis, sem custo, com o núcleo do agendamento e janela de até 90 dias, e o PROFISSIONAL (R$ 19,90/mês), que destravava relatórios, lembretes automáticos, gestão da lista de espera, exportação da agenda e janela de até 365 dias. A issue #261 acaba com o Grátis. Passa a existir só o **Plano AgendFined**, a R$ 19,90/mês, com tudo o que era do PROFISSIONAL; o conceito de "recurso profissional" desaparece.

Todo dono ganha um **teste grátis** de 30 dias corridos a partir da criação do negócio, sem cartão, com acesso completo, uma vez só. O fim do teste fica em `businesses.trial_ends_at`. Como o teste é sem cartão, criar outra conta é barato, então cada teste concedido entra num registro de testes com o hash do telefone normalizado do negócio (mesma normalização brasileira de `brazilianPhoneSchema`) e o hash do e-mail normalizado do dono (minúsculas e, em Gmail, sem `.` e sem `+tag` na parte local). O registro não guarda os dados em claro e não é apagado quando a conta é excluída. Um negócio cujo telefone ou e-mail já aparece no registro nasce sem teste. O suporte pode conceder um teste novo manualmente, para casos legítimos como um salão que trocou de dono e manteve o telefone.

Sem teste vigente e sem assinatura em dia, o negócio fica **suspenso**. Nada é apagado e o slug continua reservado. A página pública continua no mesmo endereço, avisa que o agendamento está indisponível e não oferece slots nem lista de espera. As reservas existentes continuam valendo e podem ser canceladas pelo cliente (token) e pelo dono, com os e-mails do cancelamento. O painel fica só leitura, mais cancelar reservas futuras, assinar e gerenciar a conta (dados, MFA e excluir conta). Todas as automações param: lembretes automáticos, avisos da lista de espera e sync com o Google Calendar.

O acesso é calculado no banco, na hora da consulta, por `business_has_access(business_id)`: verdadeira quando há assinatura em dia (inclusive em carência, ADR 0008) **ou** `now() < trial_ends_at`. As RPCs públicas de reserva e de lista de espera, as policies de RLS das operações do dono e o gate server-side (`assertAccess`, no lugar de `assertProPlan`) usam essa função, então a recusa vale no banco mesmo para quem chama a RPC direto. O teste acaba no instante exato de `trial_ends_at`, sem carência e sem depender de cron. Os crons só deixam de agir sobre negócios sem acesso; eles nunca concedem nem retiram acesso.

Quem assina durante o teste não perde os dias restantes: o checkout cria a preapproval com `auto_recurring.start_date = trial_ends_at`, e a primeira cobrança acontece no fim do teste. Até lá a assinatura fica `authorized` sem pagamento. Fora do teste, a cobrança começa na hora.

Na virada, todo negócio no Grátis, inclusive quem já assinou e cancelou, ganha `trial_ends_at = virada + 30 dias` e entra no registro de testes concedidos. Negócios com assinatura ativa ou em carência não mudam. Os donos afetados recebem um e-mail sobre o fim do Grátis, o teste, o preço e os novos Termos.

## Alternativas consideradas

- **Teste com cartão pelo `free_trial` do Mercado Pago:** rejeitado. Exigir cartão afasta quem quer só experimentar, e o teste ficaria preso a uma preapproval: quem não assina não teria teste, e o acesso dependeria do estado no Mercado Pago em vez de uma data no nosso banco. O `start_date` no fim do teste dá o mesmo resultado para quem decide assinar cedo.
- **Status gravado por cron (`active`/`suspended`) em vez de acesso calculado:** rejeitado. Um cron atrasado ou parado estenderia o acesso, e o estado gravado poderia divergir da assinatura e do teste. Calcular a partir de `now()` torna o fim do teste exato e deixa uma única fonte de verdade.
- **Manter o Grátis para os negócios atuais:** rejeitado. Manteria dois produtos, com os gates de plano, a janela de 90 dias e os textos do Grátis, só para uma base pequena. Os 30 dias de teste na virada dão tempo para decidir.
- **Bloqueio total da página pública do negócio suspenso:** rejeitado. O cliente com reserva marcada perderia o caminho para consultar e cancelar, e o link do negócio, já divulgado, viraria uma página de erro. A página continua de pé, só sem slots e sem lista de espera.

## Consequências

- O telefone do negócio não é verificado e pode ser trocado em Configurações; o e-mail é confirmado no cadastro. A barreira, portanto, pesa mais no e-mail: quem cria uma conta nova com outro e-mail e outro telefone ganha outro teste. Isso é aceito; exigir cartão ou CPF fica fora do escopo.
- Uma assinatura criada durante o teste está `authorized` sem ter sido paga. Se o dono cancela antes da primeira cobrança, a carência do ADR 0008 vale como para qualquer assinatura `authorized`: `max(next_payment_date, agora + 7 dias)`. No pior caso, o negócio ganha até 7 dias de acesso além do fim do teste.
- O reajuste de checkout (`reprice-checkouts`) e a validação de termos (`checkout-terms`) precisam aceitar o `start_date` de uma assinatura criada durante o teste, sem descartá-lo nem recusar a autorização.
- O fim da carência leva o negócio a suspenso, não ao Grátis. O enum `business_plan` e a coluna `businesses.plan` saem do banco.
- Não há exclusão automática de negócios suspensos por inatividade nesta versão; eles guardam dados e slug indefinidamente.

## Fontes

- Issue #261 e [`specs/007-plano-unico-e-teste-gratis/spec.md`](../../specs/007-plano-unico-e-teste-gratis/spec.md)
- [0008 — Carência do cancelamento mantém o mês já pago](0008-carencia-mantem-o-mes-pago.md)
- [0006 — Leituras e escritas públicas por RPCs com allowlist](0006-rpcs-publicas-com-allowlist.md)
- `lib/plan/plan.ts`, `lib/plan/gate.ts` — gate atual (`assertProPlan`), a substituir por `assertAccess`
- `lib/billing/mercado-pago.ts`, `lib/billing/checkout-terms.ts`, `lib/billing/reprice-checkouts.ts` — checkout e reajuste
- `lib/validation/schemas.ts` (`brazilianPhoneSchema`) — normalização do telefone
- `app/termos/page.tsx` — seção 5
