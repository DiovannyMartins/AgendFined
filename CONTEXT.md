# AgendFined

O AgendFined é uma plataforma SaaS de agendamento online para profissionais e pequenos negócios. Um profissional configura seu negócio, serviços e disponibilidade; clientes reservam serviços em uma página pública por slug. Vocabulário canônico do domínio em pt-BR.

## Language

**Negócio**:
A organização profissional que oferece serviços e recebe reservas. É o dono da agenda. No MVP, cada usuário autenticado possui exatamente um negócio.
_Avoid_: Empresa, comerciante, prestador, estabelecimento

**Negócio fora da busca**:
Negócio ativo cuja página pública funciona e recebe reservas, mas que fica fora do sitemap e é marcada `noindex` (`businesses.search_indexing_enabled = false`). Usado para os negócios de teste em produção. Um negócio inativo (`is_active = false`) não tem página pública.
_Avoid_: Negócio oculto, negócio privado

**Cliente**:
Pessoa que reserva um serviço. Não possui conta; os dados são coletados no fluxo de reserva.
_Avoid_: Usuário, consumidor, lead, paciente

**Confirmação por e-mail**:
Mensagem enviada ao e-mail informado pelo cliente após uma reserva pública ser confirmada, com os dados do atendimento, o código público e o link privado. O e-mail é opcional, na página pública e na reserva pelo painel (#195, ADR 0011): sem ele, não há confirmação nem lembrete por e-mail, e o cliente guarda o link privado na tela de confirmação, copiando ou mandando para o próprio WhatsApp.
_Avoid_: Recibo, token de acesso

**Serviço**:
O que o negócio oferece: nome, duração e preço. Pode ser desativado (is_active = false) ou excluído; ao excluir, as reservas existentes são preservadas no histórico via snapshot e perdem apenas o vínculo (service_id). Com reserva agendada (confirmada e ainda não encerrada), a exclusão é bloqueada até não haver mais nada agendado.
_Avoid_: Produto, item

**Disponibilidade**:
Regra recorrente de atendimento: dia da semana e faixas de horário em hora local do negócio.
_Avoid_: Horário, expediente, abertura

**Faixa (de atendimento)**:
Intervalo contínuo de atendimento dentro de um dia (ex.: 08:00–12:00). Um dia pode ter várias faixas, que não podem se sobrepor nem atravessar meia-noite.
_Avoid_: Janela, período, slot

**Bloqueio**:
Período específico em que o negócio não atende, sem alterar a regra recorrente. Usado para pausas, compromissos, férias e exceções. Pode começar no passado, mas não pode se sobrepor a uma reserva confirmada que ainda não terminou.
_Avoid_: Exceção, folga, indisponibilidade

**Slot**:
Um horário de início possível em que um serviço pode começar. Deriva da faixa, do intervalo de slots, da duração do serviço, da antecedência, da janela e dos conflitos.
_Avoid_: Horário, intervalo, vaga, time

**Reserva**:
O compromisso confirmado de um cliente com um serviço em um horário. Nasce como confirmed e passa por um ciclo de vida (confirmed → completed, cancelled ou no_show). Sai de confirmed uma única vez e nunca volta. completed e no_show registram o desfecho de um atendimento que já começou, então o dono pode corrigir um pelo outro ("Corrigir status" na agenda); cancelled é final, porque o horário pode já ter sido reaproveitado. Enquanto confirmed e antes de começar, pode ser remarcada sem mudar de status.
_Avoid_: Agendamento, marcação, booking, appointment

**Reserva pelo painel**:
Reserva que o dono cria no painel (Reservas → Nova reserva) para o cliente que marcou por WhatsApp, telefone ou no balcão (#193). Usa `create_owner_booking`, só para o dono: o e-mail do cliente é opcional, não há consentimento nem limite por IP, e a antecedência e a janela configurada não valem. Continuam valendo o limite de janela do plano, o início no futuro, os bloqueios e a sobreposição. Com e-mail, o cliente recebe a confirmação; sem e-mail, o dono envia o link da confirmação privada pelo WhatsApp. Conta nos relatórios como qualquer reserva.
_Avoid_: Reserva manual, reserva interna, agendamento do dono

**Remarcação**:
Mudança de uma reserva confirmada, que ainda não começou, para outro horário (#194, ADR 0010). É a mesma reserva: status, código público, link privado, snapshot e evento do Google Calendar continuam os mesmos, e a duração é a do snapshot. O dono remarca pela agenda com as regras da reserva pelo painel, inclusive o encaixe; o cliente remarca pelo link privado da confirmação, com as regras da página pública (faixas, antecedência e janela). Bloqueios e outras reservas sempre valem. O cliente recebe e-mail com o novo horário quando tem e-mail, e o dono é avisado quando o cliente remarca. Cada remarcação fica no histórico da reserva (horário anterior, novo e quem remarcou), e o horário anterior fica livre como num cancelamento.
_Avoid_: Reagendamento, transferência, troca de horário

**Encaixe**:
Reserva pelo painel ou remarcação pelo dono fora das faixas de disponibilidade, que o dono confirma explicitamente. Não passa por cima de bloqueios nem de outras reservas.
_Avoid_: Exceção, horário extra, sobreposição

**Antecedência**:
O mínimo de tempo entre agora e o início da reserva (min_notice_minutes). Padrão: 120 minutos.
_Avoid_: Lead time, aviso prévio, notice

**Janela (futura)**:
Quantos dias à frente um cliente pode reservar (booking_window_days). Padrão: 60 dias. O plano Grátis permite até 90 dias e o PRO até 365; a janela efetiva respeita o menor entre o valor configurado e o limite do plano.
_Avoid_: Prazo, alcance, horizonte, window

**Snapshot (da reserva)**:
Cópia do nome, preço e duração do serviço no momento da reserva. Garante que alterações futuras não modifiquem o histórico.
_Avoid_: Cópia, imagem, ponto no tempo

**Código público (public_code)**:
Código de 8 caracteres em Crockford base32 padrão (alfabeto `0123456789ABCDEFGHJKMNPQRSTVWXYZ`: inclui 0 e 1, exclui O, I, L e U), armazenado sem hífen e exibido agrupado (AB12-CD34), usado para identificar a reserva na tela e no e-mail de confirmação. O código digitado é normalizado antes da busca: hífens e espaços são removidos, letras viram maiúsculas e as trocas previstas pelo Crockford são aplicadas (O→0, I/L→1), então `o6yt-wmwi` encontra `06YT-WMW1`. Nunca autoriza acesso a dados do cliente.
_Avoid_: Token, link de confirmação, código de rastreio

**Token de cancelamento**:
Capability aleatória de 256 bits, independente do public_code, entregue uma única vez ao cliente (tela de confirmação e link do e-mail); seu detentor cancela ou remarca a própria reserva. Só o digest SHA-256 é armazenado; o token nunca expõe dados pessoais e não é retornado pela consulta pública.
_Avoid_: Token de sessão, código de cancelamento, hash

**Código de recuperação**:
Um dos dez códigos de uso único (10 símbolos Crockford base32, exibidos como XXXXX-XXXXX) que o dono do negócio recebe ao ativar a autenticação em duas etapas e precisa confirmar que guardou. Depois da senha, um código desativa o autenticador para o dono ativar um novo; o uso é avisado por e-mail. Só o digest SHA-256, ligado ao usuário, é armazenado (ADR 0009).
_Avoid_: Código de backup, código reserva, senha de emergência

**Lembrete pelo WhatsApp**:
Mensagem que o dono manda do próprio WhatsApp, pela agenda ("Lembrar pelo WhatsApp"), a um cliente com reserva confirmada que ainda não começou (#195, ADR 0011). A agenda só abre a conversa com o texto pronto; nada é enviado nem registrado pelo AgendFined. Não é um recurso profissional, ao contrário do lembrete automático, que continua só por e-mail.
_Avoid_: Notificação, disparo, lembrete automático

**Evento da reserva**:
O `.ics` de um único evento que o cliente baixa na tela de confirmação ("Adicionar à minha agenda"), ou o mesmo evento aberto no Google Agenda (#196). Leva só o que a confirmação já mostra ao cliente: serviço, início e fim em UTC, nome e telefone do negócio, código público e link público do negócio; nunca o token de cancelamento. O `UID` é o código público, então baixar de novo atualiza o mesmo evento. Só existe para reserva confirmada que ainda não começou e não é um recurso profissional, ao contrário da exportação da agenda do dono.
_Avoid_: Exportação, convite, sincronização

**Lista de espera**:
Fila de clientes que desejam um horário específico (serviço + início) quando ele está ocupado; deduplicada por (negócio, serviço, início, telefone). Não cria reserva automaticamente. O cliente que informa e-mail recebe um link privado para sair da lista, no mesmo contrato do token de cancelamento (ADR 0005).
_Avoid_: Fila, agendamento pendente, banco de espera

**No-show**:
Reserva em que o cliente não compareceu. Permanece no histórico; se marcado por engano, pode ser corrigido para completed (e vice-versa), mas nunca volta a confirmed.
_Avoid_: Falta, ausência, não comparecimento

**Fuso do negócio**:
Fuso IANA configurado por negócio (`businesses.timezone`, padrão America/Sao_Paulo). Datas são armazenadas em UTC; disponibilidade, bloqueios digitados no dashboard e slots são interpretados e exibidos no fuso do negócio. Não pode ser alterado enquanto houver reservas agendadas. Só fusos brasileiros são aceitos, porque o telefone do negócio e do cliente é sempre brasileiro.
_Avoid_: Fuso da aplicação, fuso único, região, hora local

## Planos

**Plano**:
A camada de produto que determina quais recursos um negócio pode usar. No AgendFined, um negócio está sempre em um de dois planos: Grátis ou PROFISSIONAL.
_Avoid_: Pacote, tier, versão, nível

**Grátis**:
O plano sem custo mensal. Contém o núcleo do agendamento: página pública, dashboard, serviços ilimitados, clientes e histórico, bloqueios, gestão de reservas e cancelamento self-service. Permite configurar uma janela futura de até 90 dias.
_Avoid_: Free, gratuito, plano básico

**PROFISSIONAL**:
O plano pago (R$ 19,90/mês) que destrava os recursos profissionais: relatórios, lembretes automáticos, gestão da lista de espera, exportação para Google Calendar/.ics e uma janela futura de até 365 dias.
_Avoid_: Pro, premium, avançado, plano pago

**Assinatura**:
O contrato recorrente mensal que mantém um negócio no plano PROFISSIONAL. Enquanto ativa, os recursos profissionais estão liberados; quando interrompida (após a carência), o negócio volta ao Grátis. A carência dura 7 dias depois de uma falha de pagamento; no cancelamento, vai até o fim do mês já pago e nunca é menor que 7 dias (ADR 0008).
_Avoid_: Billing, pagamento, cobrança, subscription

**Recurso profissional**:
Funcionalidade disponível apenas no plano PROFISSIONAL (relatórios, lembretes automáticos, gestão da lista de espera e exportação da agenda do dono para Google Calendar/.ics; o evento da reserva do cliente não conta). Nos demais planos, o recurso fica inacessível.
_Avoid_: Recurso pago, benefício, upgrade
