-- Security budget, explicit UPDATE checks, and server-only usage accounting.
-- The application calls the budget functions with service_role only; no client
-- role can inspect or mutate these counters.

alter policy profiles_update_own on public.profiles
  with check (id = auth.uid());

alter policy businesses_update_own on public.businesses
  with check (owner_id = auth.uid());

alter policy services_update_own on public.services
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

alter policy availability_update_own on public.availability
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

alter policy blocks_update_own on public.availability_blocks
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

alter policy bookings_update_own on public.bookings
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.owner_id = auth.uid()
    )
  );

create table if not exists public.security_usage_daily (
  usage_date date not null default (timezone('utc', now()))::date,
  subject_id uuid not null,
  category text not null check (category ~ '^[a-z0-9_-]{1,64}$'),
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (usage_date, subject_id, category)
);

alter table public.security_usage_daily enable row level security;
revoke all on public.security_usage_daily from public, anon, authenticated;
grant select, insert, update, delete on public.security_usage_daily to service_role;

create or replace function public.consume_security_usage_budget(
  p_subject_id uuid,
  p_category text,
  p_request_limit integer default 50,
  p_token_limit bigint default 50000
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_input bigint;
  v_output bigint;
begin
  if p_subject_id is null
     or p_category is null
     or p_category !~ '^[a-z0-9_-]{1,64}$'
     or p_request_limit < 1
     or p_token_limit < 1 then
    raise exception 'INVALID_SECURITY_USAGE_BUDGET';
  end if;

  insert into public.security_usage_daily (usage_date, subject_id, category, request_count, updated_at)
  values ((timezone('utc', now()))::date, p_subject_id, p_category, 1, now())
  on conflict (usage_date, subject_id, category) do update
    set request_count = public.security_usage_daily.request_count + 1,
        updated_at = now()
  returning request_count, input_tokens, output_tokens
  into v_count, v_input, v_output;

  return v_count <= p_request_limit and (v_input + v_output) <= p_token_limit;
end;
$$;

create or replace function public.record_security_usage(
  p_subject_id uuid,
  p_category text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_subject_id is null
     or p_category is null
     or p_category !~ '^[a-z0-9_-]{1,64}$'
     or p_input_tokens < 0
     or p_output_tokens < 0
     or p_input_tokens > 100000
     or p_output_tokens > 100000 then
    raise exception 'INVALID_SECURITY_USAGE_RECORD';
  end if;

  insert into public.security_usage_daily (
    usage_date,
    subject_id,
    category,
    input_tokens,
    output_tokens,
    updated_at
  )
  values (
    (timezone('utc', now()))::date,
    p_subject_id,
    p_category,
    p_input_tokens,
    p_output_tokens,
    now()
  )
  on conflict (usage_date, subject_id, category) do update
    set input_tokens = public.security_usage_daily.input_tokens + excluded.input_tokens,
        output_tokens = public.security_usage_daily.output_tokens + excluded.output_tokens,
        updated_at = now();
end;
$$;

revoke all on function public.consume_security_usage_budget(uuid, text, integer, bigint) from public, anon, authenticated;
grant execute on function public.consume_security_usage_budget(uuid, text, integer, bigint) to service_role;
revoke all on function public.record_security_usage(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_security_usage(uuid, text, integer, integer) to service_role;
