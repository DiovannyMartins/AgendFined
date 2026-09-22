# Research: Oferta do plano PROFISSIONAL nas configurações

## Decision: Reutilizar o catálogo canônico de planos

- **Decision**: Usar `PLAN_INFO` como fonte única para nome, preço, período e recursos de Grátis e PROFISSIONAL.
- **Rationale**: O catálogo já é compartilhado pela landing page e pelo billing, evitando divergência; ele já mantém o PROFISSIONAL em `R$ 1` para validação do checkout.
- **Alternatives considered**: Duplicar os dados dentro da seção de configurações foi rejeitado por poder exibir preço ou benefícios diferentes do checkout.

## Decision: Manter o checkout e os estados de assinatura existentes

- **Decision**: A nova oferta chamará o `UpgradeButton`/`startUpgrade` já usado pelo dashboard. Estados pendente, autorizado, pausado, cancelado e carência continuam sendo decididos pelo estado retornado de `getSubscription`.
- **Rationale**: O pedido é de apresentação e descoberta da oferta, não de um novo fluxo de cobrança. Reutilizar a ação mantém a proteção server-side e o comportamento de erro existente.
- **Alternatives considered**: Criar link ou rota de pagamento própria foi rejeitado porque duplicaria o fluxo de billing e poderia ignorar as guardas atuais.

## Decision: Exibir cards lado a lado para todo negócio Grátis

- **Decision**: Para todo negócio Grátis, mostrar o Grátis como atual e o PROFISSIONAL como opção recomendada. Se houver checkout pendente, manter a oferta visível, mas trocar o CTA do card Pro para retomar o checkout existente.
- **Rationale**: A comparação direta responde à dúvida do usuário sem remover o contexto do plano atual. O layout responsivo pode empilhar os cards em telas estreitas.
- **Alternatives considered**: Mostrar somente um resumo textual do Pro foi rejeitado porque não deixa preço e benefícios suficientemente claros antes do CTA.

## Decision: Cobertura unitária e validação estática

- **Decision**: Adicionar teste de renderização para a variante Grátis e preservar os testes de billing existentes; validar com `npm run test`, `npm run lint` e `npm run typecheck`.
- **Rationale**: A mudança é de UI/server composition e deve garantir o texto, preço e CTA sem exigir integração real com Mercado Pago.
- **Alternatives considered**: Teste e2e com checkout real foi rejeitado para esta alteração porque depende de credenciais/provedor externo e não aumenta a confiança na composição da seção.
