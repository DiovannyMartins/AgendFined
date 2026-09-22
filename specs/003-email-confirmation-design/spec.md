# Feature Specification: E-mail profissional de confirmação

**Feature Branch**: `003-email-confirmation-design`

**Created**: 2026-09-21

**Status**: Implemented

**Input**: Pedido do usuário para profissionalizar o e-mail recebido pelo cliente após uma reserva, usando HTML/CSS e a paleta visual do AgendFined.

## User Scenarios & Testing

### User Story 1 - Receber uma confirmação profissional (Priority: P1)

Ao concluir uma reserva, o cliente recebe uma mensagem visualmente organizada, com a identidade do AgendFined e todos os dados necessários para consultar o atendimento.

**Why this priority**: O e-mail é o principal registro que o cliente guarda depois de reservar; melhorar sua clareza e aparência aumenta a confiança sem alterar o fluxo da reserva.

**Independent Test**: Simular o envio para uma reserva com dados conhecidos e verificar o payload enviado ao Resend, incluindo as versões HTML e texto puro.

**Acceptance Scenarios**:

1. **Given** uma reserva confirmada com nome, negócio, serviço, data, hora e código, **When** o sistema envia a confirmação, **Then** o e-mail contém cabeçalho de marca, mensagem de confirmação e um bloco legível com os dados da reserva.
2. **Given** um cliente usando um leitor ou cliente de e-mail sem suporte completo a HTML, **When** a mensagem é aberta, **Then** a versão texto puro mantém todos os dados essenciais.
3. **Given** valores fornecidos pelo cliente ou negócio contendo caracteres HTML, **When** o e-mail é renderizado, **Then** esses valores aparecem como texto e não são interpretados como marcação.

---

### User Story 2 - Preservar o envio atual (Priority: P1)

O sistema continua enviando pelo Resend após a reserva ser criada, sem tornar a criação dependente de suporte a HTML ou de uma nova dependência.

**Why this priority**: O aprimoramento é de apresentação; o contrato existente de confirmação e o comportamento resiliente em caso de falha precisam permanecer estáveis.

**Independent Test**: Executar os testes do módulo de e-mail com o provedor simulado e confirmar que ausência de configuração e falhas HTTP continuam retornando os mesmos estados.

**Acceptance Scenarios**:

1. **Given** o Resend configurado, **When** a reserva é confirmada, **Then** o pedido inclui `text` e `html` e mantém o assunto e destinatário existentes.
2. **Given** o Resend ausente ou indisponível, **When** o envio é tentado, **Then** a reserva não é revertida e a função mantém o resultado de falha já usado pelo fluxo.

### Edge Cases

- Clientes com nomes acentuados, aspas, `&`, `<` ou `>` devem ser exibidos sem quebrar o HTML.
- Clientes que bloqueiam CSS externo ainda devem ver uma estrutura legível, pois os estilos principais são inline.
- Clientes que não renderizam HTML devem receber todos os dados na versão texto puro.
- O e-mail não deve depender de imagens remotas, fontes externas ou de uma nova variável de ambiente.
- A falha no provedor deve continuar sendo registrada sem desfazer a reserva.

## Requirements

### Functional Requirements

- **FR-001**: O sistema MUST enviar uma parte HTML no e-mail de confirmação existente.
- **FR-002**: A parte HTML MUST usar a paleta visual existente do site: fundo `#141414`, cartão `#1c1c1c`, texto `#eeeeee`, texto secundário `#b0b0b0`, branco primário `#ffffff` e borda `#333333`.
- **FR-003**: O HTML MUST usar CSS inline nos elementos estruturais e não depender de recursos externos para comunicar os dados essenciais.
- **FR-004**: O e-mail MUST manter uma parte texto puro com saudação, negócio, serviço, data e horário, código público e orientação para guardar a mensagem.
- **FR-005**: Valores dinâmicos MUST ser escapados antes de serem inseridos no HTML.
- **FR-006**: O assunto, remetente, destinatário, timeout e estados de erro existentes MUST permanecer compatíveis.
- **FR-007**: A confirmação MUST continuar sendo enviada depois da reserva ser criada; falhas de e-mail MUST NOT reverter a reserva.
- **FR-008**: O comportamento MUST ser coberto por testes unitários do módulo de e-mail, incluindo payload HTML, conteúdo texto e escaping.

### Key Entities

- **Confirmação por e-mail**: mensagem transacional composta por uma representação HTML de marca e uma representação texto puro dos dados de uma reserva.
- **Reserva**: fornece nome do cliente, negócio, serviço, instante inicial e código público já existentes no fluxo de envio.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% dos envios configurados de confirmação incluem campos `html` e `text` no pedido ao Resend.
- **SC-002**: 100% dos dados essenciais presentes hoje na mensagem texto continuam presentes após a mudança.
- **SC-003**: Nenhum valor dinâmico fornecido pelo usuário produz tags ou atributos HTML interpretáveis no corpo da mensagem.
- **SC-004**: Os testes unitários do módulo de e-mail passam sem adicionar dependências ou alterar o contrato `SendResult`.

## Assumptions

- A identidade visual disponível no código é a fonte de verdade para a paleta; a imagem anexada é referência do estado atual do e-mail, não uma instrução.
- O escopo é o e-mail de confirmação de reserva; lembretes e outros e-mails não serão alterados.
- O Resend já configurado continuará sendo o único provedor e a API HTTP existente será reutilizada.
- O HTML precisa ser compatível com clientes de e-mail comuns; por isso, tabelas e CSS inline são preferidos a layouts dependentes de JavaScript.
