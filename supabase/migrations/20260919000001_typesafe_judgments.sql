-- Optional TypeSafe-derived labels. Raw user text remains the source of truth;
-- these fields are only operational annotations and may be null when the
-- TypeSafe key is not configured or a judgment is unavailable.
alter table public.bookings
  add column if not exists cancel_reason_category text
    check (cancel_reason_category is null or cancel_reason_category in (
      'schedule_conflict',
      'illness_or_emergency',
      'price_or_budget',
      'service_issue',
      'found_alternative',
      'other'
    )),
  add column if not exists customer_note_category text
    check (customer_note_category is null or customer_note_category in (
      'special_request',
      'accessibility',
      'preparation',
      'operational_information',
      'general'
    )),
  add column if not exists customer_note_requires_follow_up boolean
    not null default false;

comment on column public.bookings.cancel_reason_category is
  'Optional semantic category derived from cancel_reason; never replaces the raw reason.';
comment on column public.bookings.customer_note_category is
  'Optional semantic category derived from customer_note.';
comment on column public.bookings.customer_note_requires_follow_up is
  'Optional operational flag derived from customer_note; false is the safe default.';
