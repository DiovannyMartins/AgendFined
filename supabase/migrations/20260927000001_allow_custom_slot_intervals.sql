alter table public.businesses
  drop constraint if exists businesses_slot_interval_minutes_check;

alter table public.businesses
  add constraint businesses_slot_interval_minutes_check
  check (slot_interval_minutes between 1 and 1440);
