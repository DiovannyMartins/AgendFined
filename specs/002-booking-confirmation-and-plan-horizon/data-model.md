# Data Model: Confirmação de reserva e janela por plano

## Dados persistidos

Não são criadas tabelas.

### businesses

- `plan`: autoridade existente que distingue `free` e `pro`.
- `booking_window_days`: preferência existente (1–365 após a migration); a janela efetiva não excede 90 para `free` ou 365 para `pro`.

### bookings

- `customer_email_snapshot`: continua nullable para registros antigos, mas é obrigatório e validado nas novas reservas públicas.
- `public_code`, `start_at`, `service_name_snapshot` e `customer_name_snapshot`: usados para compor a confirmação sem consultar ou revelar dados adicionais.

## Regra efetiva

```text
cap = (plan == "pro") ? 365 : 90
effectiveWindowDays = min(booking_window_days, cap)
requestedLocalDate <= todayInSaoPaulo + effectiveWindowDays
```

O dia final é inclusivo para acompanhar a regra de disponibilidade atual.
