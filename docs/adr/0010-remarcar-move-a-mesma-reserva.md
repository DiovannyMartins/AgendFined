# 0010 — Remarcar move a mesma reserva

**Status:** aceito

Até o #194 não havia remarcação: o cliente cancelava e reservava de novo, correndo o risco de perder o horário antigo sem achar outro, e o dono só podia cancelar, um status final (`CONTEXT.md`). A questão era se remarcar seria "mover a mesma reserva" ou "cancelar e criar uma nova ligada à anterior".

Remarcar move a mesma reserva. A linha de `bookings` continua `confirmed` e só `start_at` e `end_at` mudam; `end_at` usa a duração do snapshot (ADR 0002), não a duração atual do serviço. Ficam iguais o código público (ADR 0004), o digest do token de cancelamento (ADR 0005), o snapshot, o cliente, as observações e o evento do Google Calendar, cujo id é derivado da reserva: a sincronização faz `PUT` no mesmo evento em vez de apagar e recriar. O link privado que o cliente já recebeu continua valendo e mostra o horário novo. A tabela `booking_reschedules` guarda cada movimento (horário anterior, horário novo, quem remarcou e quando), e `bookings.rescheduled_at` marca o último. O ciclo de vida não muda: nenhum status novo e nenhuma volta de um status final.

Duas RPCs fazem o movimento, ambas travando o negócio e depois a reserva, como as de criação. `reschedule_owner_booking` é do dono (`owner_id = auth.uid()` e MFA), com as regras da reserva pelo painel (#193): início no futuro e limite do plano, sem antecedência nem janela configurada; o encaixe fora das faixas é confirmado na Server Action. `reschedule_booking_by_public_code` é do cliente, restrita à service role, e exige o digest do token, com as regras de `create_booking`: antecedência, janela efetiva, negócio e serviço ativos; as faixas são checadas na Server Action, como numa reserva pública. As duas recusam reserva que não está confirmada ou que já começou (#141). Bloqueios e sobreposição continuam no banco: o `UPDATE` dispara `prevent_booking_block_overlap` e a exclusion constraint (ADR 0003), e a própria faixa antiga nunca conflita, porque é a mesma linha. Por isso a reserva pode se mover dentro do próprio intervalo.

O lembrete é zerado (`reminder_sent_at` e o claim voltam a nulo), e `get_due_booking_reminders` compara a antecedência do lembrete com `coalesce(rescheduled_at, created_at)`: quem remarca para dentro da janela do lembrete já recebeu o e-mail de remarcação, como quem reserva dentro dela já recebeu a confirmação (#144).

## Alternativas consideradas

- **Cancelar e criar uma reserva nova ligada à anterior:** rejeitado. O cliente receberia código e link novos, e o link do e-mail de confirmação passaria a mostrar uma reserva cancelada; o token bruto não é guardado (ADR 0005), então o link novo só poderia ser entregue por um e-mail que pode não sair (#187). Os relatórios contariam um cancelamento e uma reserva para um único atendimento, e o Google Calendar apagaria e recriaria o evento. Haveria ainda uma janela entre cancelar e criar em que outra pessoa poderia pegar o horário novo, ou o antigo se a criação falhasse.
- **Status `rescheduled`:** rejeitado, porque a reserva continua confirmada para o mesmo atendimento; um status a mais obrigaria toda consulta de agenda, relatório e sobreposição a tratá-lo.
- **Só a coluna `rescheduled_at`, sem tabela de histórico:** rejeitado, porque perderia o horário anterior, que o dono e o suporte precisam ver quando o cliente diz que "estava marcado para outro dia".

## Consequências

- O cliente que tem o link privado pode remarcar quantas vezes quiser dentro das regras; o limite por IP da consulta vale para cada tentativa. Se isso virar abuso, um teto de remarcações por reserva cabe em `reschedule_booking_by_public_code`.
- Remarcar libera o horário antigo como um cancelamento libera: a lista de espera daquele horário não é avisada automaticamente, e o dono a gerencia como hoje.
- Uma reserva cujo serviço foi excluído ou desativado só pode ser remarcada pelo dono.

## Fontes

- Issue #194 (análise de beta de 24/10/2026)
- `supabase/migrations/20261025000000_reschedule_booking.sql`
- `lib/bookings/reschedule.ts` (dono) e `lib/booking/reschedule.ts` (cliente)
- `tests/integration/reschedule.integration.ts`
