# Quickstart: Oferta do plano PROFISSIONAL nas configurações

## Pré-requisitos

- Node.js 22 ou superior conforme `AGENTS.md`.
- Dependências instaladas com `npm install`.
- Variáveis do projeto configuradas para acessar o dashboard.

## Validação automatizada

Na raiz do repositório:

```powershell
npm run test -- --project unit
npm run lint
npm run typecheck
```

Resultados esperados:

- O teste da seção confirma Grátis atual, PROFISSIONAL, `R$ 19/mês`, benefícios e CTA de assinatura para um negócio Grátis.
- Lint e TypeScript terminam sem erros.

## Validação manual

1. Inicie o app com `npm run dev`.
2. Entre no dashboard e abra `/dashboard/configuracoes` com um negócio Grátis sem checkout pendente.
3. Confirme que Grátis aparece como atual e PROFISSIONAL aparece como opção de assinatura com `R$ 19/mês`, recursos Pro e botão `Assinar PROFISSIONAL`.
4. Se o ambiente Mercado Pago estiver configurado, clique no CTA e confirme que o checkout existente é aberto.
5. Repita com um negócio PROFISSIONAL autorizado e confirme que aparecem o status ativo e o cancelamento, sem upgrade duplicado.
6. Verifique em viewport estreita que os cards empilham sem rolagem horizontal.
