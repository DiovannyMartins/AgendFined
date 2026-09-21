# Feature Specification: E-mail de confirmação e janela de reservas por plano

**Feature Branch**: `002-booking-confirmation-and-plan-horizon`

**Created**: 2026-09-20

**Status**: Implemented

**Input**: User request to email customers after booking and limit how far ahead each plan can accept reservations.

## User Scenarios & Testing

### User Story 1 - Receber confirmação da reserva (Priority: P1)

Ao concluir uma reserva, o cliente recebe uma confirmação no endereço de e-mail informado.

**Why this priority**: A confirmação reduz incerteza e dá ao cliente um registro dos dados do atendimento.

**Independent Test**: Criar uma reserva com e-mail válido e verificar o envio de uma mensagem contendo negócio, serviço, data, horário e código da reserva.

**Acceptance Scenarios**:

1. **Given** um horário disponível e um endereço de e-mail válido, **When** o cliente confirma a reserva, **Then** a reserva é criada e uma mensagem de confirmação é enviada para esse endereço.
2. **Given** o e-mail obrigatório ausente ou inválido, **When** o cliente tenta reservar, **Then** a reserva é recusada com indicação para corrigir o endereço.
3. **Given** a reserva já foi gravada e o provedor de e-mail está indisponível, **When** o envio falha, **Then** a reserva continua confirmada e o sistema registra a falha sem pedir ao cliente que crie outra reserva.

### User Story 2 - Reservar dentro do limite do plano (Priority: P1)

O cliente só pode escolher datas dentro da janela configurada para o negócio e limitada pelo plano vigente: até 90 dias no Grátis e até 365 dias no PRO.

**Why this priority**: A janela de reservas é uma regra comercial do plano e precisa valer tanto na agenda pública como na gravação da reserva.

**Independent Test**: Para negócios Grátis e PRO, solicitar horários na data-limite e depois dela; confirmar que a data-limite configurada permanece disponível e a seguinte não pode ser reservada quando exceder o teto do plano.

**Acceptance Scenarios**:

1. **Given** negócio no plano Grátis, **When** a data solicitada excede o menor valor entre a configuração e 90 dias, **Then** nenhum horário é oferecido e a reserva direta também é recusada.
2. **Given** negócio no plano PRO, **When** a data solicitada excede o menor valor entre a configuração e 365 dias, **Then** nenhum horário é oferecido e a reserva direta também é recusada.
3. **Given** negócio com janela configurada menor que o teto do plano, **When** o cliente tenta reservar além da janela configurada, **Then** a reserva é recusada.
4. **Given** o proprietário edita a janela futura, **When** salva uma quantidade acima do teto vigente, **Then** o valor é recusado e a interface mostra o limite correspondente ao plano.

## Edge Cases

- Negócios Grátis existentes podem ter um valor salvo acima de 90 dias; a janela efetiva deve ser limitada imediatamente e a tela deve exibir um valor válido para edição.
- Um plano ausente ou diferente de `pro` segue as regras do plano Grátis.
- Reservas existentes sem e-mail continuam legíveis; novas reservas públicas exigem e-mail.
- Falhas ou ausência de configuração do Resend não desfazem uma reserva já gravada.
- O fim da janela é inclusivo por data no fuso fixo `America/Sao_Paulo`, igual à regra de disponibilidade já usada pelo produto.

## Requirements

### Functional Requirements

- **FR-001**: O formulário público de reserva MUST exigir um endereço de e-mail válido.
- **FR-002**: Após criar uma reserva confirmada, o sistema MUST enviar ao cliente uma confirmação com negócio, serviço, data, horário e código público da reserva.
- **FR-003**: Uma falha de envio MUST NOT reverter nem duplicar uma reserva já criada; a falha MUST ser registrada no servidor.
- **FR-004**: A janela de reservas MUST respeitar o menor valor entre a configuração do negócio e o limite do plano: 90 dias para Grátis ou 365 dias para PRO.
- **FR-005**: O limite MUST ser aplicado à consulta de horários, à ação de reserva no servidor e à RPC do banco de dados.
- **FR-006**: O painel MUST mostrar e validar o teto de janela correspondente ao plano atual.
- **FR-007**: A alteração MUST preservar os dados de e-mail das reservas antigas e não mudar o comportamento da lista de espera.

### Key Entities

- **Reserva**: reserva confirmada com snapshots do cliente, serviço, data e código público.
- **Negócio**: possui plano vigente e quantidade de dias configurada para receber reservas futuras.
- **Confirmação por e-mail**: mensagem transacional enviada para o endereço capturado na reserva.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Cada nova reserva pública válida tem um pedido de envio de confirmação para o e-mail informado.
- **SC-002**: Nenhuma nova reserva é gravada além da janela configurada ou do teto de 90/365 dias, mesmo quando a ação pública é contornada.
- **SC-003**: O valor máximo aceito pelo painel corresponde ao plano atual e a configuração de uma janela menor continua funcionando.

## Assumptions

- “3 meses” e “1 ano” são representados na regra existente, que trabalha em dias, por 90 e 365 dias.
- O e-mail passa a ser obrigatório na reserva pública para cumprir a confirmação; os registros existentes permanecem compatíveis.
- O negócio pode configurar uma janela menor que o máximo concedido pelo plano.
- O envio usa o Resend já configurado no projeto por `RESEND_API_KEY` e `RESEND_FROM_EMAIL`; um erro do provedor não cancela a reserva.
