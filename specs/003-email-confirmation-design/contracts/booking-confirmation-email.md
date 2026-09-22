# Contract: confirmação por e-mail

## Resend request

`POST https://api.resend.com/emails` continua recebendo:

- `from`: valor de `RESEND_FROM_EMAIL`;
- `to`: lista com o e-mail do cliente;
- `subject`: `Sua reserva foi confirmada`;
- `text`: fallback texto puro com os dados da reserva;
- `html`: versão visual da mesma confirmação.

## Compatibility

- `sendBookingConfirmationEmail` continua retornando `{ sent: true }`, `{ sent: false, reason: "not_configured" }` ou `{ sent: false, reason: "provider_error" }`.
- Falha ou ausência de configuração não lança para o chamador e não altera a reserva.
