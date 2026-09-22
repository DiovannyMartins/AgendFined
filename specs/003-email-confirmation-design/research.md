# Research: E-mail profissional de confirmação

## Decisões

1. **Reutilizar o envio HTTP existente para o Resend**
   - `lib/email/booking-confirmation.ts` já é server-side, lê `RESEND_API_KEY` e `RESEND_FROM_EMAIL`, aplica timeout e traduz falhas para `SendResult`.
   - O payload do Resend aceita `text` e `html` no mesmo envio; não é necessário adicionar SDK ou dependência.

2. **Usar HTML com tabelas e CSS inline**
   - Clientes de e-mail têm suporte desigual a CSS moderno. Uma tabela centralizada com estilos inline é compatível com clientes comuns e continua legível quando estilos de cabeçalho são ignorados.
   - O layout não usará imagens remotas, fontes externas, JavaScript ou recursos que possam falhar no carregamento.

3. **Reutilizar os tokens visuais do site**
   - A fonte de verdade em `app/globals.css` é monocromática: `#141414`, `#1c1c1c`, `#eeeeee`, `#b0b0b0`, `#ffffff` e `#333333`.
   - O e-mail usará o fundo escuro do produto no cabeçalho e no cartão principal, com bordas e texto secundário nos mesmos valores.

4. **Escapar dados antes da interpolação**
   - Nome do cliente, negócio, serviço e código são dados dinâmicos. Um helper local de escaping HTML evita que conteúdo controlado pelo usuário seja interpretado como marcação.
   - A versão texto puro continuará sem escaping HTML para não alterar o que o cliente lê.

5. **Manter fallback de texto puro**
   - A parte `text` permanece como contrato de fallback e deve continuar contendo exatamente os dados essenciais já enviados.

## Pontos não aplicáveis

- Não há mudança de banco, rota pública, autenticação, RLS ou timezone.
- O anexo do usuário é referência do e-mail atual e não contém instruções executáveis.
