# Contrato: Reserva pública

## Server action `createBooking`

- Entrada inclui endereço de e-mail válido e obrigatório.
- Se a data exceder a janela efetiva, retorna erro funcional sem persistir a reserva.
- Em sucesso, retorna o código público da reserva existente.
- Após criar a reserva, solicita ao Resend o envio da confirmação. Indisponibilidade do provedor é registrada sem invalidar o sucesso da reserva.

## RPC `public.create_booking`

- Continua acessível apenas a `service_role`.
- Recusa e-mail vazio com `BOOKING_EMAIL_REQUIRED`.
- Recusa data além do limite efetivo com `BOOKING_OUTSIDE_PLAN_WINDOW`.
- Preserva forma e retorno já existentes da RPC.
