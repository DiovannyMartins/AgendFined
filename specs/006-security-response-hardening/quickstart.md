# Quickstart: Security Response Hardening

## Configuration

Production requires `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, and `APP_URL` or `NEXT_PUBLIC_APP_URL`. `CANCEL_TOKEN_SECRET` becomes obsolete after rollout.

## Database rollout

1. Review migration ordering.
2. Validate locally when Docker is available.
3. Push with `npx supabase db push --linked` only after confirming the target.
4. Verify anonymous tables are denied and reviewed public RPCs work.

## Automated validation

```powershell
npm run test
npm run lint
npm run typecheck
npm run build
```

Integration tests require the Node 22 command in `AGENTS.md` and mutate their configured project.

## Validation recorded on 2026-09-22

- Unit suite: 41 files, 290 tests passed.
- Focused security regression suite: 8 files, 38 tests passed after final edits.
- ESLint: passed with 9 pre-existing unused-parameter warnings and no errors.
- TypeScript: passed.
- Next.js production build: passed.
- Runtime header probe: HTTP 200 with CSP, HSTS, `nosniff`, `DENY`, `no-referrer`, permissions policy, and no `X-Powered-By`.
- Supabase migrations `20260929000000_security_response_hardening.sql` and `20260929000001_fix_waitlist_cancel_token.sql`: applied to and confirmed on the linked remote project.
- Remote integration suite on Node 22: 12 files, 87 tests passed.
- Supabase security advisors: completed; remaining warnings cover intentional reviewed security-definer RPCs, extension placement/history, mutable search paths on extension-generated range constructors, and leaked-password protection that must be enabled in hosted Auth configuration.
- Supabase remote schema lint: passed with no errors. Local lint remains unavailable because Docker/Postgres on port 54322 is stopped.

## Manual checks

1. Create a booking; confirm distinct `code` and `cancel` values.
2. Remove/change `cancel`; cancellation is unavailable or fails generically.
3. Confirm email has the private link but never the digest.
4. Call `/auth/callback` without credentials; expect `/login?error=auth`.
5. Confirm defensive headers and absent `X-Powered-By`.
6. Force billing errors and ensure raw canary text never reaches the result.
