# Verification Quickstart

1. Run `npx vitest run --project unit`.
2. Run `npm run typecheck`.
3. Run `npm run lint`.
4. Inspect the new migration with `npx supabase db lint` if a linked/local database is available.
5. Run the integration project through Node 22 when Supabase credentials are configured.
6. The migration was applied to the linked project with `npx supabase db push --linked`.
7. The Edge Function was deployed with `npx supabase functions deploy booking-reminders`.
8. Configure the operator-owned reminder secrets before enabling the scheduler:
   `npx supabase secrets set REMINDER_CRON_SECRET=<matching-cron-secret> RESEND_API_KEY=<resend-key> RESEND_FROM_EMAIL=<verified-sender>`.
9. On Supabase managed projects, configure the `booking-reminders` pg_cron command
   to set `app.reminder_cron_url` and `app.reminder_cron_secret` in the same
   session before calling `public.process_booking_reminders()`. The linked
   project is configured this way because managed Supabase rejects `ALTER ROLE`
   for custom settings.
