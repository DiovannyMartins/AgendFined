# Research: E-mail de confirmação e janela por plano

## Decisões

1. **Enviar via Resend no servidor**: o projeto já usa `RESEND_API_KEY` e `RESEND_FROM_EMAIL` para lembretes; uma função de servidor Next reutiliza o mesmo provedor sem nova dependência. O envio acontece depois da RPC confirmar a reserva. Falhas são registradas e não alteram a reserva.
2. **E-mail obrigatório**: o campo público hoje é opcional, o que impediria a confirmação para parte das reservas. Torná-lo obrigatório alinha a captura com o novo requisito; e-mails em linhas históricas permanecem nullable.
3. **Teto efetivo, configuração preservada**: `booking_window_days` continua a permitir que o negócio escolha uma janela menor. A regra aplicada é `min(valor configurado, 90)` para Grátis e `min(valor configurado, 365)` para PRO, incluindo negócios que já tenham um valor acima do novo teto.
4. **Defesa em profundidade**: a mesma regra é refletida ao listar horários, na server action e na RPC `create_booking`. O RPC compara datas no fuso fixo existente, evitando permitir chamadas fora da interface.
5. **Compatibilidade**: ampliar o limite do campo do banco de 180 para 365 é necessário para a configuração PRO de um ano; não se torna um limite efetivo para contas Grátis.

## Referências do projeto

- `CONTEXT.md`: a janela é configurável em dias e o padrão é 60.
- `lib/booking/availability.ts`: a janela é por data local inclusiva em `America/Sao_Paulo`.
- `supabase/functions/booking-reminders/index.ts` e `.env.example`: Resend e seus nomes de variáveis já existem.
- `supabase/migrations/20260928000000_backend_security_concurrency_hardening.sql`: definição atual da RPC `create_booking`.
