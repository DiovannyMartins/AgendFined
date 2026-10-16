# Revisão da oferta PROFISSIONAL e dos Termos

**Estado:** atualização informativa aplicada em 15 de outubro de 2026; confirmação do preço de produção e revisão jurídica ainda pendentes. Este documento não substitui aconselhamento jurídico.

## Comportamento confirmado no repositório

- A landing page e o dashboard usam o catálogo compartilhado `lib/plan/catalog.ts`.
- O preço exibido deriva de `MERCADO_PAGO_PRO_AMOUNT_CENTS`, com padrão de `1900` centavos (R$ 19,00), e frequência `/mês`.
- O checkout é criado como pré-aprovação recorrente no Mercado Pago.
- A assinatura só libera o plano PROFISSIONAL quando o estado consultado do provedor é `authorized`; voltar do checkout, por si só, não ativa o plano.
- Cancelamento solicitado pelo painel interrompe a assinatura no provedor. O acesso PROFISSIONAL permanece durante carência de 7 dias e depois o negócio volta ao Grátis.
- O estado `paused`, usado também pelo Mercado Pago para falha de pagamento recorrente, segue a mesma carência segundo ADR 0008.
- O plano Grátis continua disponível. A oferta lista relatórios, lembretes automáticos, gestão da lista de espera, exportação Google Calendar/.ics e janela futura de até 365 dias.

## Diferenças encontradas

Em `app/termos/page.tsx`, a seção 5 anteriormente dizia que valores e condições seriam informados antes da contratação, sem descrever recorrência, ativação, cancelamento ou carência. O texto foi atualizado com as regras confirmadas no código, distinguindo a carência operacional do direito legal de arrependimento. A tela de configurações agora explicita recorrência mensal e o prazo de até sete dias.

O preço pode ser sobrescrito por variável de ambiente. Portanto, a aprovação do preço de R$ 19,00/mês deve também confirmar o valor efetivamente configurado no Mercado Pago e na Vercel Production, sem copiar ou registrar credenciais.

## Texto informativo aplicado

O preço continua exibido dinamicamente pela oferta compartilhada; os Termos esclarecem que o preço vigente e as condições aparecem antes da confirmação, sem cristalizar R$ 19,00 caso o valor de produção esteja diferente. Explicam ainda cobrança mensal recorrente, ativação após autorização, cancelamento, carência técnica de até sete dias e preservação do direito de arrependimento.

Permanece necessária validação jurídica/comercial sobre momento exato da cobrança inicial e renovações, regras do Mercado Pago para estorno, tratamento de inadimplência, identidade do fornecedor e informações obrigatórias de contato. A atualização evita definir política de reembolso própria e encaminha pedidos pelo canal oficial.

O art. 49 do CDC trata de relações de consumo celebradas fora do estabelecimento. Como o AgendFined oferece SaaS a profissionais/negócios, a caracterização de cada contratação como relação de consumo depende das circunstâncias e não deve ser afirmada de forma universal nos Termos. A redação foi ajustada para preservar a hipótese legal sem declarar que todo assinante tem ou não tem esse direito. O enquadramento concreto e o fluxo operacional de reembolso precisam de assessor jurídico. Referências consultadas em 15 de outubro de 2026: [Código de Defesa do Consumidor, art. 49](https://planalto.gov.br/ccivil_03/leis/l8078compilado.htm) e [Decreto 7.962/2013, arts. 4º e 5º](https://planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm).

## Aprovação a registrar

- [ ] Confirmar que o preço efetivo de produção é R$ 19,00/mês.
- [ ] Confirmar frequência, renovação e forma de cancelamento mostradas no checkout do Mercado Pago.
- [ ] Aprovar a explicação de ativação após autorização e carência de 7 dias.
- [ ] Revisar direitos de arrependimento, reembolso, inadimplência e identificação do fornecedor com assessor jurídico.
- [x] Atualizar `app/termos/page.tsx` e a explicação de cancelamento no dashboard, sem fixar preço diferente do configurado.
- [ ] Assessor jurídico revisar o enquadramento do SaaS para negócios e a redação/procedimento de arrependimento e estorno.
- [ ] Registrar data, aprovador e versão aprovada antes de publicar.

## Referências locais

- `CONTEXT.md` — vocabulário de plano e assinatura.
- `docs/adr/0008-plano-profissional-mercado-pago.md` — decisão de produto e ciclo de assinatura.
- `lib/plan/catalog.ts` — catálogo e preço.
- `lib/billing/cancel-subscription.ts` e `lib/billing/handle-webhook.ts` — cancelamento, ativação e carência.
- `app/termos/page.tsx` — texto atualmente publicado no código.
