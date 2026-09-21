# Quickstart: Confirmação e limites de reserva

## Configuração

Configure no ambiente do servidor Next.js `RESEND_API_KEY` e `RESEND_FROM_EMAIL` com os mesmos valores de envio transacional usados no Supabase Edge Function. Não exponha essas variáveis com prefixo `NEXT_PUBLIC_`.

Antes de publicar a aplicação, aplique a migration `20260928000003_booking_confirmation_plan_window.sql` no Supabase.

## Verificação manual

1. No plano Grátis, ajuste a janela para 90 dias; confirme que 91 é recusado e que datas além da janela não oferecem horários.
2. Em negócio Grátis existente com valor salvo acima de 90 dias, confirme que a agenda pública já respeita 90 e que o painel mostra um valor editável dentro do teto.
3. No plano PRO, ajuste a janela para 365 dias; confirme que 365 é aceito e 366 recusado.
4. Faça uma reserva com endereço válido e confirme no provedor que a mensagem contém negócio, serviço, data/horário e código.
5. Tente reservar com e-mail vazio ou inválido; confirme que a reserva é rejeitada antes de chamar a RPC.
6. Faça uma reserva com as variáveis do Resend ausentes ou com envio falhando; confirme que a reserva continua confirmada e a falha é registrada no servidor.

Datas de teste devem ser determinadas no fuso `America/Sao_Paulo`, conforme a regra de janela inclusiva do produto.
