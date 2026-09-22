# Data Model: Checkout direto para usuários autenticados

Esta feature não cria entidades persistentes nem altera o schema. Ela compõe dados já existentes.

## Sessão autenticada

- **Fonte**: Supabase Auth, consultada no servidor por `auth.getUser()`.
- **Uso**: determina se o CTA PROFISSIONAL deve renderizar um link para cadastro ou o iniciador de checkout.
- **Regra**: somente a existência de `user` retornada pelo servidor habilita o fluxo autenticado.

## Resultado de `startUpgrade`

- **Sucesso**: `{ ok: true, initPoint: string }`; o `initPoint` é atribuído à nova aba.
- **Falha**: `{ ok: false, code, message }`; a aba temporária é fechada e `message` é exibida inline.
- **Regra**: o client não interpreta preço, plano ou elegibilidade; apenas encaminha o resultado do server action.

## Checkout PROFISSIONAL

- **Persistência**: continua sendo criado e controlado pelo fluxo de billing atual, incluindo tentativa/idempotência e assinatura Mercado Pago.
- **Preço**: permanece definido pelo billing/catalog existente em R$ 1/mês; nenhum valor é recebido do navegador.
- **Retorno**: continua usando o callback atual do Mercado Pago.
