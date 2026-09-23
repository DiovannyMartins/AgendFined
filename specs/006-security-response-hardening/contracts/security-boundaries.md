# Contracts: Security Boundaries

## Booking creation

```ts
{ ok: true; publicCode: string; cancelToken: string }
```

The token is returned only once and placed in the private confirmation URL. It must not be logged.

## Confirmation

```text
/{slug}/confirmacao?code={publicCode}&cancel={cancelToken}
```

`code` locates display-safe data. `cancel` is optional for display and required to render cancellation controls. The page never derives or fetches a token.

## Cancellation

Input: `code`, `token`, optional `cancelReason`.

```ts
{ status: "error"; message: "Não foi possível cancelar esta reserva." }
```

Missing, malformed, incorrect, unknown, and non-confirmed states are externally indistinguishable.

## Turnstile

Verification receives token, expected action, and optional client address. Trusted hostname comes from configured application URL. Actions: `booking_write` for creation/waitlist and `booking_consult` for lookup.

## Other boundaries

- Billing retains stable machine codes and application-owned messages, never upstream error text.
- Auth supports `code`, or `token_hash` plus supported `type`; other combinations redirect to `{trustedOrigin}/login?error=auth`.
- All paths receive CSP, HSTS, `nosniff`, frame denial, `no-referrer`, and restrictive permissions policies; Next.js `X-Powered-By` is disabled.
