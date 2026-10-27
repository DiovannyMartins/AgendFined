-- #228: the grace downgrade decides on businesses.current_subscription_id.
-- 20260919000000 picked the CURRENT subscription as the newest-created row,
-- written before current_subscription_id became the authoritative pointer.
-- The webhook deliberately makes an older row current: when the owner pays a
-- checkout B that a retry replaced with a newer checkout C, B becomes current
-- and C is cancelled (or still pending). The cron then saw C as "current" and
-- downgraded a paying business to free, and link_billing_attempt_subscription
-- refused a new checkout (CURRENT_SUBSCRIPTION_CONFLICT) while B was authorized.
--
-- A pro business is now downgraded when its current subscription is not
-- `authorized` and no grace is still active anywhere for that business.
-- Legacy businesses whose current_subscription_id was never backfilled keep the
-- previous rule (newest row), so a lapsed legacy grace is still enforced and a
-- pro business with no subscriptions at all is left alone, as before.
--
-- Posture preserved: security definer + `set search_path = ''`,
-- fully-qualified references, service_role-only grant, idempotent.

create or replace function public.downgrade_expired_subscriptions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.businesses b
  set plan = 'free'
  where b.plan = 'pro'
    and exists (
      select 1
      from public.subscriptions s
      where s.business_id = b.id
        and s.status <> 'authorized'
        and s.id = coalesce(
          b.current_subscription_id,
          (
            select s2.id
            from public.subscriptions s2
            where s2.business_id = b.id
            order by s2.created_at desc
            limit 1
          )
        )
    )
    and not exists (
      select 1
      from public.subscriptions g
      where g.business_id = b.id
        and g.status in ('paused', 'cancelled')
        and g.grace_period_end is not null
        and g.grace_period_end >= now()
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.downgrade_expired_subscriptions() from public, anon, authenticated;
grant execute on function public.downgrade_expired_subscriptions() to service_role;
