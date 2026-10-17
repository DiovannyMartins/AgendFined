-- businesses.current_subscription_id picks which assinatura makes the negócio
-- PROFISSIONAL when Mercado Pago authorizes it (apply_subscription_snapshot).
-- Only the billing flows move it, through the service role (no auth.uid()).
-- The owner session can write businesses through PostgREST directly, so refuse
-- an owner write here too, as protect_business_plan does for the plan.
create or replace function public.protect_business_current_subscription()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' and new.current_subscription_id is not null then
      raise exception 'CURRENT_SUBSCRIPTION_SELF_SERVE_DISABLED'
        using errcode = 'P0001',
        hint = 'A new business starts without a current subscription; billing sets it.';
    end if;
    if tg_op = 'UPDATE'
       and new.current_subscription_id is distinct from old.current_subscription_id
    then
      raise exception 'CURRENT_SUBSCRIPTION_SELF_SERVE_DISABLED'
        using errcode = 'P0001',
        hint = 'The current subscription can only be changed by the billing flows.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_business_current_subscription()
  from public, anon, authenticated, service_role;

drop trigger if exists protect_business_current_subscription on public.businesses;
create trigger protect_business_current_subscription
  before insert or update of current_subscription_id on public.businesses
  for each row execute function public.protect_business_current_subscription();
