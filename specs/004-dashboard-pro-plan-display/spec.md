# Feature Specification: Oferta do plano PROFISSIONAL nas configurações

**Feature Branch**: `004-dashboard-pro-plan-display`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "Exibir o plano PROFISSIONAL para assinatura na seção Plano das configurações, mantendo o valor de R$ 19."

## User Scenarios & Testing

### User Story 1 - Conhecer e assinar o plano PROFISSIONAL (Priority: P1)

Como proprietário de um negócio no plano Grátis, quero ver a oferta completa do plano PROFISSIONAL na tela de configurações, incluindo preço, benefícios e ação de assinatura, para decidir e iniciar o upgrade sem procurar outra página.

**Why this priority**: A seção atual mostra apenas o plano vigente e deixa o usuário sem uma apresentação clara da oferta paga.

**Independent Test**: Acessar Configurações com um negócio no plano Grátis e confirmar que os dois planos aparecem, que o PROFISSIONAL exibe R$ 19/mês e que a ação de assinatura inicia o fluxo de checkout.

**Acceptance Scenarios**:

1. **Given** um negócio no plano Grátis, com ou sem checkout pendente, **When** o proprietário abre Configurações, **Then** a seção Plano mostra o Grátis identificado como atual e uma oferta separada do PROFISSIONAL.
2. **Given** a oferta do PROFISSIONAL visível, **When** o proprietário a examina, **Then** ela mostra o preço de R$ 19/mês, os recursos exclusivos e uma ação com texto explícito de assinatura.
3. **Given** um negócio no plano Grátis, **When** o proprietário seleciona a ação de assinatura do PROFISSIONAL, **Then** o sistema inicia o checkout existente e mantém mensagens amigáveis caso o checkout não possa ser criado.

### User Story 2 - Entender o plano já contratado (Priority: P2)

Como proprietário que já possui o plano PROFISSIONAL, quero continuar vendo meu plano como ativo e seus controles de assinatura, para acompanhar e gerenciar a assinatura sem perder as informações atuais.

**Why this priority**: A melhoria não pode transformar uma tela de oferta em uma regressão para assinantes existentes.

**Independent Test**: Acessar Configurações com um negócio PROFISSIONAL autorizado e confirmar o status ativo, os recursos do plano e a ação de cancelamento.

**Acceptance Scenarios**:

1. **Given** um negócio PROFISSIONAL com assinatura autorizada, **When** o proprietário abre Configurações, **Then** o plano PROFISSIONAL aparece como atual/ativo, com os recursos e o controle de cancelamento preservados.
2. **Given** um negócio com checkout pendente ou período de carência, **When** o proprietário abre Configurações, **Then** os avisos e ações correspondentes continuam visíveis, o card PROFISSIONAL permanece visível quando o plano atual é Grátis e não é criado um segundo checkout.

### Edge Cases

- Se o plano atual for Grátis e houver checkout pendente, o card PROFISSIONAL deve permanecer visível, mas sua ação deve retomar o checkout existente em vez de criar uma segunda assinatura.
- Se o plano atual for PROFISSIONAL, a oferta não deve apresentar o usuário como se ainda estivesse no Grátis nem oferecer um upgrade duplicado.
- O preço exibido deve permanecer R$ 19/mês em todos os locais da oferta desta tela, inclusive em larguras menores.
- Falhas do checkout devem continuar sendo comunicadas na própria seção, sem esconder os dados dos planos.

## Requirements

### Functional Requirements

- **FR-001**: A seção Plano deve apresentar o plano atual do negócio com identificação visual inequívoca de estado atual ou ativo.
- **FR-002**: Quando o plano atual for Grátis, independentemente de existir checkout pendente, a seção deve apresentar uma oferta separada do PROFISSIONAL.
- **FR-003**: A oferta do PROFISSIONAL deve exibir o preço de teste de **R$ 19/mês** e seus recursos exclusivos: relatórios, lembretes automáticos, gestão da lista de espera, exportação de agenda e reservas futuras até 365 dias.
- **FR-004**: A oferta do PROFISSIONAL deve disponibilizar uma ação claramente rotulada; para negócio Grátis sem checkout pendente ela inicia o checkout, e com checkout pendente ela retoma o pagamento existente.
- **FR-005**: A seção deve continuar exibindo status, carência, retomada de checkout e cancelamento conforme o estado atual da assinatura.
- **FR-006**: Um negócio já PROFISSIONAL não deve ver uma ação de upgrade duplicada; deve continuar vendo os controles aplicáveis à assinatura atual.
- **FR-007**: A apresentação deve permanecer legível e utilizável em telas estreitas e largas.
- **FR-008**: A mudança não deve alterar as regras de acesso dos recursos nem o valor armazenado ou enviado ao provedor de pagamento.

### Key Entities

- **Plano**: Oferta Grátis ou PROFISSIONAL, com nome, preço, período, descrição e lista de recursos.
- **Assinatura**: Estado do vínculo pago do negócio, incluindo checkout pendente, autorização, pausa, cancelamento e carência.
- **Negócio**: Conta cujo plano atual determina qual oferta e quais controles são apresentados.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% dos negócios Grátis veem, na seção Plano, tanto o estado atual Grátis quanto a oferta PROFISSIONAL com preço e CTA apropriado ao estado do checkout.
- **SC-002**: Um proprietário consegue identificar o preço, pelo menos um benefício e a ação de assinatura do PROFISSIONAL sem navegar para outra página.
- **SC-003**: 100% dos estados de assinatura já suportados (pendente, autorizada, pausada, cancelada e em carência) continuam exibindo seu status e ação correspondente.
- **SC-004**: A oferta permanece utilizável sem rolagem horizontal em uma viewport de 320 px de largura.

## Assumptions

- O valor de R$ 19/mês é intencional para validação do checkout e deve ser mantido nesta alteração, mesmo que a documentação de lançamento mencione R$ 199.
- O fluxo de checkout existente é a fonte de verdade para iniciar uma assinatura; esta mudança não cria um novo provedor ou uma nova rota.
- O plano Grátis continua sendo um produto completo de agendamento, e a oferta PROFISSIONAL apenas destaca os recursos já definidos no catálogo.
- A tela de marketing já apresenta os dois planos e não precisa ser alterada para atender esta solicitação.
