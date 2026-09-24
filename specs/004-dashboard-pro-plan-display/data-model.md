# Data Model: Oferta do plano PROFISSIONAL nas configurações

Não há entidades novas nem alterações de banco para esta feature. A implementação somente projeta entidades existentes na seção de configurações.

## Plano

- **Fonte**: catálogo compartilhado de planos.
- **Valores**: `free` e `pro`.
- **Atributos exibidos**: nome, preço, período, descrição e lista de recursos.
- **Regra**: o preço exibido para `pro` nesta feature é `R$ 19` por `mês`.

## Negócio

- **Atributos consumidos**: `id` e plano atual.
- **Regra**: o plano do negócio determina o badge de atual/ativo e se a oferta de upgrade é apresentada.

## Assinatura

- **Estados consumidos**: `pending`, `authorized`, `paused`, `cancelled` e carência.
- **Regra**: a assinatura existente controla mensagens, retry, reativação e cancelamento; a oferta de upgrade não deve duplicar esses controles.

## Transições relevantes

`free sem assinatura` → `checkout pending` → `authorized/pro` permanece no fluxo de billing existente. A feature não altera persistência nem as transições.
