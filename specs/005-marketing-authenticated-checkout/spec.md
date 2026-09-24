# Feature Specification: Checkout direto para usuários autenticados

**Feature Branch**: `005-marketing-authenticated-checkout`
**Created**: 2026-09-21
**Status**: Updated
**Input**: User description: "Para quem já está logado, o botão Assinar PROFISSIONAL deve abrir o Mercado Pago em vez de ir para o dashboard; se já houver checkout pendente, deve gerar um checkout novo; os botões de checkout devem usar a mesma aba."

## User Scenarios & Testing

### User Story 1 - Assinar diretamente estando logado (Priority: P1)

Como usuário autenticado que está avaliando o plano PROFISSIONAL, quero que o botão de assinatura da página pública inicie o checkout do Mercado Pago diretamente, para não passar primeiro pelo dashboard.

**Why this priority**: Reduz uma etapa desnecessária no caminho de conversão e atende o fluxo explícito solicitado para usuários já autenticados.

**Independent Test**: Com uma sessão autenticada e um negócio elegível, clicar em "Assinar PROFISSIONAL" deve criar o checkout pelo fluxo de billing existente e navegar para o `init_point` do Mercado Pago na mesma aba.

**Acceptance Scenarios**:

1. **Given** uma sessão autenticada com negócio no plano Grátis, **When** o usuário clica em "Assinar PROFISSIONAL", **Then** o sistema chama o fluxo de upgrade existente e navega para o checkout retornado pelo Mercado Pago na mesma aba.
2. **Given** que o checkout ainda está sendo criado, **When** o usuário observa o botão, **Then** o botão fica desabilitado e informa que o redirecionamento está em andamento.
3. **Given** que o usuário clica no botão, **When** o checkout é criado com sucesso, **Then** o sistema navega para o Mercado Pago na própria aba, sem depender de pop-ups.
4. **Given** uma sessão autenticada com uma assinatura pendente, **When** o usuário clica em "Assinar PROFISSIONAL", **Then** o sistema gera um novo checkout e navega para ele na mesma aba, sem exibir a mensagem de pagamento pendente como erro final.

---

### User Story 2 - Manter o fluxo de visitantes (Priority: P2)

Como visitante não autenticado, quero continuar sendo direcionado para o cadastro ao clicar em "Assinar PROFISSIONAL", para criar minha conta antes de iniciar uma assinatura.

**Why this priority**: Preserva o onboarding atual e evita iniciar um checkout sem identidade ou negócio associado.

**Independent Test**: Com a sessão encerrada, abrir a página pública e verificar que o CTA aponta para `/cadastro`.

**Acceptance Scenarios**:

1. **Given** um visitante sem sessão, **When** ele clica em "Assinar PROFISSIONAL", **Then** ele é direcionado para `/cadastro`.

---

### User Story 3 - Exibir falhas de checkout sem navegação indevida (Priority: P3)

Como usuário autenticado, quero receber a mensagem retornada pelo billing quando a assinatura não puder ser iniciada, para saber como corrigir o problema sem ser enviado para uma tela incorreta.

**Why this priority**: Mantém o tratamento existente de ambiente não configurado, negócio ausente ou assinatura já ativa.

**Independent Test**: Simular uma resposta de falha de `startUpgrade` e verificar que o usuário permanece na página atual e a mensagem aparece no próprio card.

**Acceptance Scenarios**:

1. **Given** que o fluxo de billing retorna falha, **When** o usuário tenta assinar, **Then** a mensagem de erro é apresentada na página atual sem navegação.
2. **Given** que o usuário já possui uma assinatura PROFISSIONAL ou não possui negócio configurado, **When** tenta iniciar o checkout, **Then** o sistema exibe a mensagem de domínio existente sem confirmar uma assinatura no navegador.

### Edge Cases

- O checkout deve substituir a página atual somente depois de o server action retornar um `initPoint` válido.
- Se a criação do checkout falhar, o usuário deve permanecer na página atual e receber a mensagem de erro.
- A sessão deve ser verificada no servidor para decidir qual CTA renderizar; o navegador não deve escolher o fluxo com base em estado não confiável.
- O fluxo de retorno do Mercado Pago continua usando o callback existente e não é alterado por esta feature.

## Requirements

### Functional Requirements

- **FR-001**: O sistema MUST verificar no servidor se existe uma sessão autenticada ao renderizar a página de marketing.
- **FR-002**: Para usuário autenticado, o CTA "Assinar PROFISSIONAL" MUST iniciar o fluxo de upgrade existente e, quando houver uma assinatura pendente, MUST usar o fluxo de retry para gerar um novo checkout.
- **FR-003**: Para usuário autenticado, o sistema MUST navegar para o `initPoint` retornado pelo Mercado Pago na mesma aba.
- **FR-004**: O sistema MUST manter o CTA de visitantes apontando para `/cadastro`.
- **FR-005**: Enquanto o checkout estiver sendo criado, o CTA MUST ficar desabilitado e comunicar o estado de processamento.
- **FR-006**: Falhas retornadas pelo billing MUST ser exibidas ao usuário na página atual e não MUST redirecionar para o dashboard.
- **FR-007**: O checkout autenticado MUST reutilizar as validações, idempotência e configuração de preço dos fluxos de billing existentes.
- **FR-008**: Uma nova tentativa MUST continuar protegida contra duplicidade e conflitos de estado pelo server-side billing, mesmo quando o CTA for acionado repetidamente.

## Key Entities

- **Sessão autenticada**: Identidade Supabase usada pelo servidor para decidir se o visitante já pode iniciar o checkout.
- **Checkout PROFISSIONAL**: Pré-aprovação criada pelo fluxo de billing, identificada pelo `initPoint` do Mercado Pago.
- **Resultado de upgrade**: Resultado de sucesso ou erro retornado pelos fluxos inicial ou de retry, incluindo mensagem para feedback da interface.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% dos cliques autenticados elegíveis no CTA navegam diretamente para o checkout do Mercado Pago na mesma aba, sem passar por `/dashboard`.
- **SC-002**: 100% dos cliques anônimos continuam levando a `/cadastro`.
- **SC-003**: Falhas de checkout ficam visíveis no mesmo card em até uma resposta do fluxo de billing, sem navegação incorreta.
- **SC-004**: O fluxo existente de assinatura e seu preço de R$ 19/mês permanecem inalterados.
- **SC-005**: 100% dos usuários autenticados com checkout pendente que clicarem no CTA recebem a oportunidade de iniciar um checkout novo, sem precisar visitar o dashboard.

## Assumptions

- A sessão autenticada e o negócio atual são resolvidos pelas funções Supabase e billing já existentes.
- Os fluxos existentes de upgrade continuam sendo a fonte de verdade para o preço, elegibilidade, idempotência e criação do checkout.
- A abertura em nova aba é o comportamento desejado também na página pública.
- A configuração de `MERCADO_PAGO_ACCESS_TOKEN` já é responsabilidade do ambiente, fora do escopo desta alteração.
