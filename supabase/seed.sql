-- Development / preview seed only. Never run against production.
-- §20.4 step 7. Demo data must never contain real personal information.

-- A demo profile must reference an existing auth.users row. In local dev,
-- create the user via the Auth UI/DB first, then link this profile by email,
-- or insert with a known auth uid. This seed is illustrative and idempotent.
insert into public.profiles (id, display_name)
values ('00000000-0000-0000-0000-000000000001', 'Demo Barber')
on conflict (id) do nothing;

insert into public.businesses (id, owner_id, name, slug, phone)
values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Barbearia Demo',
  'barbearia-demo',
  '+5511999999999'
)
on conflict (id) do nothing;

insert into public.services (id, business_id, name, duration_minutes, price_cents)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Corte', 30, 4000),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Barba', 15, 2000)
on conflict (id) do nothing;

-- weekday uses the ISO/UI convention 1=Domingo .. 7=Sábado.
insert into public.availability (business_id, weekday, start_time, end_time)
values
  ('10000000-0000-0000-0000-000000000001', 2, '08:00', '12:00'), -- Segunda
  ('10000000-0000-0000-0000-000000000001', 2, '14:00', '18:00'), -- Segunda
  ('10000000-0000-0000-0000-000000000001', 3, '08:00', '18:00')  -- Terça
on conflict do nothing;
