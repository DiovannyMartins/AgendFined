# Data Model: E-mail profissional de confirmação

## Input: BookingConfirmation

Objeto já existente, sem alteração de persistência:

| Campo | Tipo | Uso no template |
|---|---|---|
| `customerName` | `string` | Saudação personalizada |
| `customerEmail` | `string` | Destinatário do Resend |
| `businessName` | `string` | Detalhe do negócio |
| `serviceName` | `string` | Detalhe do serviço |
| `startAt` | `string` | Formatado por `formatWhen` |
| `publicCode` | `string` | Código público da reserva |

## Message Payload

O payload mantém os campos existentes (`from`, `to`, `subject`, `text`) e adiciona `html`. Não há armazenamento ou migração.

## Security Boundary

Todos os campos que entram no HTML passam por escaping de `&`, `<`, `>`, `"` e `'`. O corpo texto puro não recebe escaping HTML.
