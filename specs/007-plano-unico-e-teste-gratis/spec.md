# Feature Specification: Plano AgendFined único e teste grátis de 30 dias

**Feature Branch**: `007-plano-unico-e-teste-gratis`
**Created**: 2026-10-31
**Status**: Draft
**Input**: User description: "Tirar o plano grátis e deixar só um plano pago (R$ 19,90/mês) como plano único. Quem acaba de criar a conta, antes da primeira assinatura, pode testar um mês grátis; depois disso precisa pagar."

## Resumo das decisões

- O plano Grátis deixa de existir. O AgendFined passa a ter um plano único, o **Plano AgendFined** (R$ 19,90/mês), com tudo o que hoje é do PROFISSIONAL, inclusive a janela de 365 dias. O conceito de "recurso profissional" desaparece.
- Todo dono ganha um **teste grátis** de 30 dias corridos, sem cartão, com acesso completo, uma vez só.
- Sem teste vigente e sem assinatura em dia, o negócio fica **suspenso**: nada é apagado, o painel fica restrito e a página pública não aceita reservas.
- O acesso é calculado no banco por `business_has_access()`, a partir do horário atual, e não depende de cron.

## User Scenarios & Testing

### User Story 1 - Testar o produto completo sem cartão (Priority: P1)

Como dono que acabou de criar a conta, quero usar o AgendFined completo por 30 dias sem informar cartão, para decidir se vale pagar.

**Why this priority**: É a porta de entrada de todo cliente novo depois do fim do Grátis.

**Independent Test**: Criar uma conta e um negócio novos; conferir que `trial_ends_at` é a criação + 30 dias, que relatórios, lembretes, lista de espera, exportação e janela de 365 dias funcionam e que a página pública aceita reservas.

**Acceptance Scenarios**:

1. **Given** um dono sem teste anterior, **When** ele cria o negócio, **Then** o negócio ganha teste grátis até a criação + 30 dias e todos os recursos ficam liberados.
2. **Given** um negócio em teste, **When** o dono abre o painel, **Then** ele vê o banner "Faltam X dias do seu teste grátis · Assinar", em destaque nos últimos 3 dias.
3. **Given** um negócio em teste, **When** faltam 3 dias, 1 dia e quando o teste acaba, **Then** o dono recebe um e-mail em cada um desses momentos.
4. **Given** um negócio em teste, **When** `trial_ends_at` passa sem assinatura, **Then** o negócio fica suspenso no mesmo instante, sem carência e sem depender de cron.

---

### User Story 2 - Assinar durante o teste sem perder dias (Priority: P1)

Como dono em teste, quero assinar antes do fim do teste sem perder os dias que restam.

**Why this priority**: Assinar cedo é o comportamento que o produto quer incentivar.

**Independent Test**: Com um negócio em teste, iniciar o checkout e conferir que a preapproval é criada com `auto_recurring.start_date` igual ao fim do teste e que o negócio continua com acesso até lá e depois dele.

**Acceptance Scenarios**:

1. **Given** um negócio em teste, **When** o dono assina, **Then** a preapproval é criada com a primeira cobrança no fim do teste e a assinatura fica `authorized` sem pagamento até essa data.
2. **Given** uma assinatura criada durante o teste, **When** o dono a cancela antes da primeira cobrança, **Then** a carência segue o ADR 0008: `max(next_payment_date, agora + 7 dias)`.
3. **Given** um negócio suspenso, **When** o dono assina, **Then** a cobrança começa na hora e o acesso volta quando a assinatura fica `authorized`.

---

### User Story 3 - Negócio suspenso não opera, mas não perde nada (Priority: P1)

Como dono sem assinatura, quero continuar vendo meus dados, avisar meus clientes e sair da conta, sem conseguir operar até assinar.

**Why this priority**: Substitui o rebaixamento para o Grátis, que deixa de existir.

**Independent Test**: Com um negócio suspenso, conferir a página pública, as RPCs públicas chamadas diretamente, o painel e as automações.

**Acceptance Scenarios**:

1. **Given** um negócio suspenso, **When** um visitante abre a página pública, **Then** ela continua no mesmo endereço, avisa "agendamento indisponível" e não oferece slots nem lista de espera.
2. **Given** um negócio suspenso, **When** alguém chama a RPC pública de reserva ou de lista de espera diretamente, **Then** o banco recusa a operação.
3. **Given** um negócio suspenso com reservas futuras, **When** o cliente usa o link de cancelamento, **Then** o cancelamento funciona e os e-mails desse cancelamento são enviados.
4. **Given** um negócio suspenso, **When** o dono abre o painel, **Then** ele pode ver reservas, clientes e histórico, cancelar reservas futuras, assinar e gerenciar a conta (dados, MFA e excluir conta). Criar ou editar serviços, disponibilidade, bloqueios e reservas, mudar configurações, ver relatórios e mexer na lista de espera ficam bloqueados.
5. **Given** um negócio suspenso, **When** os crons rodam, **Then** não saem lembretes automáticos nem avisos da lista de espera e não há sync com o Google Calendar.

---

### User Story 4 - Um teste por pessoa (Priority: P2)

Como dono do produto, quero impedir que a mesma pessoa crie várias contas para ganhar testes seguidos.

**Why this priority**: O teste é sem cartão, então criar outra conta é barato.

**Independent Test**: Criar um negócio, excluir a conta e criar outra com o mesmo telefone do negócio ou o mesmo e-mail normalizado; conferir que o novo negócio nasce suspenso.

**Acceptance Scenarios**:

1. **Given** um teste já concedido a um telefone de negócio ou a um e-mail de dono, **When** uma conta nova usa o mesmo telefone ou o mesmo e-mail normalizado, **Then** o negócio é criado sem teste, já suspenso, com a mensagem "Este telefone ou e-mail já usou o teste grátis" e o botão de assinar.
2. **Given** um dono que excluiu a conta, **When** ele cria uma conta nova, **Then** o registro do teste anterior continua valendo.
3. **Given** um caso legítimo (por exemplo, um salão que trocou de dono e manteve o telefone), **When** o suporte libera manualmente, **Then** o negócio ganha um teste novo.

---

### User Story 5 - Virada dos negócios que estão no Grátis (Priority: P1)

Como dono que hoje usa o Grátis, quero ser avisado e ter tempo para decidir antes de perder o acesso.

**Why this priority**: É a única fatia que muda algo para quem já usa o app.

**Independent Test**: Rodar a migration da virada num banco com negócios no Grátis, assinantes e negócios em carência; conferir quem ganhou teste e quem não mudou.

**Acceptance Scenarios**:

1. **Given** um negócio no Grátis no dia da virada, inclusive quem já assinou e cancelou, **When** a migration roda, **Then** ele ganha `trial_ends_at = virada + 30 dias` e é registrado como teste concedido.
2. **Given** um negócio com assinatura ativa ou em carência, **When** a migration roda, **Then** nada muda para ele.
3. **Given** a virada, **When** ela entra no ar, **Then** os donos que estavam no Grátis recebem um e-mail sobre o fim do Grátis, os 30 dias de teste, o preço de R$ 19,90/mês e os novos Termos.

### Edge Cases

- O teste acaba no instante exato de `trial_ends_at`; um cron atrasado não pode estender o acesso.
- Uma assinatura `authorized` criada durante o teste não teve pagamento. O ADR 0008 continua valendo: no pior caso, quem cancela ganha até 7 dias além do teste. Isso é aceito.
- O reajuste de checkout (`reprice-checkouts`) e a validação de termos (`checkout-terms`) não podem descartar nem rejeitar o `start_date` de uma assinatura criada durante o teste.
- Um retrato do Mercado Pago que interrompe a assinatura leva o negócio para suspenso depois da carência, e não para o Grátis.
- Um negócio suspenso mantém o slug reservado; não há exclusão automática por inatividade nesta versão.
- Normalização de e-mail para o registro de testes: minúsculas e, em Gmail, sem `.` e sem `+tag` na parte local. O telefone usa a mesma normalização brasileira já aplicada ao negócio.

## Requirements

### Functional Requirements

- **FR-001**: O sistema MUST ter um único plano, o Plano AgendFined, a R$ 19,90/mês, com todos os recursos que hoje são do PROFISSIONAL e janela futura de até 365 dias.
- **FR-002**: O sistema MUST remover o plano Grátis do produto, do banco (`business_plan`/`businesses.plan`), da interface e dos textos.
- **FR-003**: Ao criar um negócio elegível, o sistema MUST gravar `trial_ends_at = criação + 30 dias`.
- **FR-004**: O sistema MUST registrar cada teste concedido numa tabela que guarda hashes do telefone normalizado do negócio e do e-mail normalizado do dono e que não é apagada quando a conta é excluída.
- **FR-005**: Um negócio cujo telefone ou e-mail normalizado já tenha registro de teste MUST nascer sem teste, suspenso.
- **FR-006**: O suporte MUST conseguir conceder manualmente um teste novo a um negócio.
- **FR-007**: O banco MUST expor `business_has_access(business_id)`, verdadeira quando há assinatura em dia (inclusive em carência) **ou** `now() < trial_ends_at`.
- **FR-008**: As RPCs públicas de reserva e de lista de espera, as policies de RLS das operações do dono e o gate server-side (`assertAccess`, substituindo `assertProPlan`) MUST usar `business_has_access()`. A recusa MUST valer no banco, não só na interface.
- **FR-009**: O cancelamento pelo cliente (token) e pelo dono MUST continuar funcionando para negócios suspensos.
- **FR-010**: Crons de lembretes, de lista de espera e de sync com o Google Calendar MUST ignorar negócios sem acesso.
- **FR-011**: O checkout iniciado durante o teste MUST criar a preapproval com `auto_recurring.start_date = trial_ends_at`; fora do teste, a cobrança começa na hora.
- **FR-012**: O fim da carência (ADR 0008) MUST deixar o negócio sem acesso (suspenso) em vez de rebaixá-lo ao Grátis; as regras de duração da carência não mudam.
- **FR-013**: O painel MUST mostrar o banner do teste durante todo o teste, em destaque nos últimos 3 dias, e a tela de suspensão quando não houver acesso.
- **FR-014**: O sistema MUST enviar ao dono e-mails em D-3, D-1 e D0 do fim do teste, sem duplicar envios.
- **FR-015**: A página de planos MUST mostrar um card único: "30 dias grátis, sem cartão · depois R$ 19,90/mês · cancele quando quiser", com o CTA "Começar teste grátis".
- **FR-016**: A seção 5 dos Termos MUST cobrir o teste grátis (um por pessoa, sem cartão), a suspensão por falta de assinatura (dados mantidos, página pública sem reservas) e a assinatura durante o teste com primeira cobrança no fim dele.
- **FR-017**: A migration da virada MUST conceder 30 dias de teste a todo negócio no Grátis, registrar esses testes e não alterar assinantes nem negócios em carência; no mesmo dia, os donos afetados MUST receber o e-mail de aviso.

## Key Entities

- **Plano AgendFined**: plano único e pago do produto.
- **Teste grátis**: 30 dias de acesso completo, uma vez por dono, guardado em `businesses.trial_ends_at`.
- **Registro de teste concedido**: hashes do telefone e do e-mail normalizados, com a data da concessão; sobrevive à exclusão da conta.
- **Acesso**: resultado de `business_has_access()`; assinatura em dia ou teste vigente.
- **Suspenso**: negócio sem acesso; dados mantidos, painel restrito, página pública sem reservas e sem automações.

## Success Criteria

- **SC-001**: Nenhuma reserva nova é criada num negócio sem acesso, inclusive por chamada direta às RPCs.
- **SC-002**: Um negócio em teste perde o acesso no minuto em que `trial_ends_at` passa, sem depender de cron.
- **SC-003**: Quem assina durante o teste tem a primeira cobrança na data do fim do teste.
- **SC-004**: Excluir a conta e recriá-la com o mesmo telefone ou e-mail não concede um segundo teste.
- **SC-005**: Depois da virada, não resta nenhuma referência ao plano Grátis no banco, no código, na interface e nos Termos.

## Entregas

1. ADR novo (fim do Grátis, teste grátis e suspensão), atualização do ADR 0008 e do `CONTEXT.md` (Plano AgendFined, Teste grátis, Suspenso; saem Grátis e Recurso profissional).
2. Banco: `trial_ends_at`, tabela de testes concedidos, `business_has_access()`, checagem nas RPCs públicas e na RLS, remoção de `businesses.plan`.
3. App: `assertAccess`, painel suspenso, banner do teste e crons que ignoram negócios sem acesso.
4. Checkout com `start_date` no fim do teste; fim da carência leva a suspenso; `checkout-terms` e `reprice-checkouts` compatíveis.
5. E-mails D-3, D-1 e D0 do fim do teste.
6. Página de planos, cadastro e Termos.
7. Virada: migration dos negócios no Grátis e e-mail de aviso. Entra por último.

## Fora do escopo

- Exclusão automática de negócios suspensos por inatividade.
- Exigir cartão ou CPF no cadastro.
- Lembretes para reservas existentes de negócios suspensos.
