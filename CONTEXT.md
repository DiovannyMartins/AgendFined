# AgendFined

O AgendFined é uma plataforma SaaS de agendamento online para profissionais e pequenos negócios. Um profissional configura seu negócio, serviços e disponibilidade; clientes reservam serviços em uma página pública por slug. Vocabulário canônico do domínio em pt-BR.

## Language

**Negócio**:
A organização profissional que oferece serviços e recebe reservas. É o dono da agenda. No MVP, cada usuário autenticado possui exatamente um negócio.
_Avoid_: Empresa, comerciante, prestador, estabelecimento

**Cliente**:
Pessoa que reserva um serviço. Não possui conta; os dados são coletados no fluxo de reserva.
_Avoid_: Usuário, consumidor, lead, paciente

**Serviço**:
O que o negócio oferece: nome, duração e preço. Pode ser desativado (is_active = false) ou excluído; ao excluir, as reservas existentes são preservadas no histórico via snapshot e perdem apenas o vínculo (service_id).
_Avoid_: Produto, item

**Disponibilidade**:
Regra recorrente de atendimento: dia da semana e faixas de horário em hora local do negócio.
_Avoid_: Horário, expediente, abertura

**Faixa (de atendimento)**:
Intervalo contínuo de atendimento dentro de um dia (ex.: 08:00–12:00). Um dia pode ter várias faixas, que não podem se sobrepor nem atravessar meia-noite.
_Avoid_: Janela, período, slot

**Bloqueio**:
Período específico em que o negócio não atende, sem alterar a regra recorrente. Usado para pausas, compromissos, férias e exceções.
_Avoid_: Exceção, folga, indisponibilidade

**Slot**:
Um horário de início possível em que um serviço pode começar. Deriva da faixa, do intervalo de slots, da duração do serviço, da antecedência, da janela e dos conflitos.
_Avoid_: Horário, intervalo, vaga, time

**Reserva**:
O compromisso confirmado de um cliente com um serviço em um horário. Nasce como confirmed e passa por um ciclo de vida (confirmed → completed, cancelled ou no_show).
_Avoid_: Agendamento, marcação, booking, appointment

**Antecedência**:
O mínimo de tempo entre agora e o início da reserva (min_notice_minutes). Padrão: 120 minutos.
_Avoid_: Lead time, aviso prévio, notice

**Janela (futura)**:
Quantos dias à frente um cliente pode reservar (booking_window_days). Padrão: 60 dias.
_Avoid_: Prazo, alcance, horizonte, window

**Snapshot (da reserva)**:
Cópia do nome, preço e duração do serviço no momento da reserva. Garante que alterações futuras não modifiquem o histórico.
_Avoid_: Cópia, imagem, ponto no tempo

**Código público (public_code)**:
Código de 8 caracteres em Crockford base32 (sem 0/O, 1/I/L), armazenado sem hífen e exibido agrupado (AB12-CD34), usado apenas na tela pública de confirmação. Nunca autoriza acesso a dados do cliente.
_Avoid_: Token, link de confirmação, código de rastreio

**Token de cancelamento**:
Capability HMAC-SHA256 derivada do public_code com segredo server-only; seu detentor (a tela de confirmação) cancela a própria reserva. Nunca é armazenado, nunca expõe dados pessoais e não é retornado pela consulta pública.
_Avoid_: Token de sessão, código de cancelamento, hash

**Lista de espera**:
Fila de clientes que desejam um horário específico (serviço + início) quando ele está ocupado; deduplicada por (negócio, serviço, início, telefone). Não cria reserva automaticamente.
_Avoid_: Fila, agendamento pendente, banco de espera

**No-show**:
Reserva em que o cliente não compareceu. Estado terminal que permanece no histórico.
_Avoid_: Falta, ausência, não comparecimento

**Timezone (do negócio)**:
Identificador IANA do negócio (ex.: America/Sao_Paulo). Datas são armazenadas em UTC e exibidas nesse fuso.
_Avoid_: Fuso, região, hora local

## Planos

**Plano**:
A camada de produto que determina quais recursos um negócio pode usar. No AgendFined, um negócio está sempre em um de dois planos: Grátis ou PROFISSIONAL.
_Avoid_: Pacote, tier, versão, nível

**Grátis**:
O plano sem custo mensal. Contém o núcleo do agendamento: página pública, dashboard, serviços ilimitados, clientes e histórico, bloqueios, gestão de reservas e cancelamento self-service.
_Avoid_: Free, gratuito, plano básico

**PROFISSIONAL**:
O plano pago (R$ 19/mês) que destrava os recursos profissionais: relatórios, lembretes automáticos, gestão da lista de espera e exportação para Google Calendar/.ics.
_Avoid_: Pro, premium, avançado, plano pago

**Assinatura**:
O contrato recorrente mensal que mantém um negócio no plano PROFISSIONAL. Enquanto ativa, os recursos profissionais estão liberados; quando interrompida (após a carência), o negócio volta ao Grátis.
_Avoid_: Billing, pagamento, cobrança, subscription

**Recurso profissional**:
Funcionalidade disponível apenas no plano PROFISSIONAL (relatórios, lembretes automáticos, gestão da lista de espera e exportação Google Calendar/.ics). Nos demais planos, o recurso fica inacessível.
_Avoid_: Recurso pago, benefício, upgrade
