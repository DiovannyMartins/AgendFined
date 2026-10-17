# Bloqueios gravados com deslocamento de fuso — diagnóstico e correção opcional

> Revisão humana obrigatória. Nada aqui foi executado contra dados remotos.
> Não transforme este SQL em migration em `supabase/migrations/`: `db push`
> aplicaria a correção sem revisão.

## O problema

Até a correção de `createBlock` (`lib/availability/actions.ts`), o formulário de
bloqueio enviava o valor de `datetime-local` sem offset (ex.: `2026-10-19T12:00`)
e a action o gravava direto em `availability_blocks.start_at/end_at`
(`timestamptz`). Como a sessão do Postgres/PostgREST usa UTC, o horário de parede
foi interpretado como UTC.

Efeito: um bloqueio de almoço 12:00–13:00 em `America/Sao_Paulo` foi gravado como
12:00–13:00 **UTC**, isto é, 09:00–10:00 em Brasília. Os slots de 12:00/12:30
continuaram reserváveis e a checagem de conflito com reservas usou o intervalo
errado. O deslocamento é exatamente o offset do fuso do negócio (−3h em
São Paulo, −4h em Manaus etc.).

O bug existe desde a criação dos bloqueios (commit `a9229ce`, 2026-08-29). O
dashboard é o único caminho que grava `availability_blocks`, então **todo
bloqueio criado antes do deploy da correção** deve ser tratado como deslocado.
Bloqueios criados depois do deploy estão corretos.

## 1. Diagnóstico (somente leitura)

Substitua `:deploy_at` pelo instante (UTC) em que a correção entrou em produção.
`corrected_*` mostra onde o bloqueio deveria estar, usando o fuso atual do
negócio (aproximação: a coluna `businesses.timezone` foi removida em 2026-09-22 e
restaurada em 2026-10-13 com padrão `America/Sao_Paulo`).

```sql
select
  bl.id,
  bl.business_id,
  bus.timezone,
  bl.reason,
  bl.created_at,
  bl.start_at                                         as stored_start_at,
  bl.end_at                                           as stored_end_at,
  (bl.start_at at time zone 'UTC') at time zone bus.timezone as corrected_start_at,
  (bl.end_at   at time zone 'UTC') at time zone bus.timezone as corrected_end_at,
  exists (
    select 1
    from public.bookings b
    where b.business_id = bl.business_id
      and b.status <> 'cancelled'
      and tstzrange(
            (bl.start_at at time zone 'UTC') at time zone bus.timezone,
            (bl.end_at   at time zone 'UTC') at time zone bus.timezone,
            '[)'
          ) && tstzrange(b.start_at, b.end_at, '[)')
  ) as corrected_overlaps_booking
from public.availability_blocks bl
join public.businesses bus on bus.id = bl.business_id
where bl.created_at < :deploy_at
order by bl.business_id, bl.start_at;
```

Leitura do resultado:

- `corrected_end_at <= now()`: bloqueio passado; não afeta mais slots. Não precisa
  ser corrigido.
- `corrected_overlaps_booking = true`: existe reserva ativa dentro do horário que
  o dono queria bloquear — normalmente um cliente que reservou durante a pausa por
  causa do bug. O trigger `enforce_block_booking_overlap` rejeitará a correção
  dessa linha. Decida com o dono (reagendar/cancelar a reserva ou manter o
  bloqueio como está) antes de corrigir.

## 2. Correção opcional (escrita — só após revisão)

Corrige apenas bloqueios futuros, criados antes do deploy e sem conflito com
reservas. Rode em transação, confira a contagem e só então faça `commit`.

```sql
begin;

update public.availability_blocks bl
set
  start_at = (bl.start_at at time zone 'UTC') at time zone bus.timezone,
  end_at   = (bl.end_at   at time zone 'UTC') at time zone bus.timezone
from public.businesses bus
where bus.id = bl.business_id
  and bl.created_at < :deploy_at
  and ((bl.end_at at time zone 'UTC') at time zone bus.timezone) > now()
  and not exists (
    select 1
    from public.bookings b
    where b.business_id = bl.business_id
      and b.status <> 'cancelled'
      and tstzrange(
            (bl.start_at at time zone 'UTC') at time zone bus.timezone,
            (bl.end_at   at time zone 'UTC') at time zone bus.timezone,
            '[)'
          ) && tstzrange(b.start_at, b.end_at, '[)')
  )
returning bl.id, bl.start_at, bl.end_at;

-- Confira as linhas retornadas contra o diagnóstico; então:
-- commit;   ou   rollback;
```

Invariantes preservados: a correção só desloca o intervalo inteiro, então
`block_time_ordered` continua válido, e o trigger
`enforce_block_booking_overlap` continua sendo a última barreira contra
sobreposição com reservas.

## 3. Depois da correção

- Avise os donos afetados das linhas com `corrected_overlaps_booking = true` que
  não foram corrigidas.
- Confira o resultado pelo `returning` e não reexecute a correção (nem o
  diagnóstico como critério de "ainda falta corrigir"): **a correção não é
  idempotente** — rodá-la duas vezes desloca os bloqueios de novo. Registre os
  ids corrigidos.
