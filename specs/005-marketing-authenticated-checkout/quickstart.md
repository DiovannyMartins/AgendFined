# Quickstart: Checkout direto para usuários autenticados

## Pré-requisitos

- Dependências instaladas com `npm install`.
- Variáveis de Supabase configuradas.
- Para testar o redirecionamento real, `MERCADO_PAGO_ACCESS_TOKEN` configurado no ambiente de desenvolvimento.

## Validação automatizada

```powershell
npm run test
npm run lint
npm run typecheck
```

Os testes unitários devem cobrir:

1. CTA anônimo apontando para `/cadastro`.
2. CTA autenticado abrindo uma nova aba e navegando ao `initPoint` retornado.
3. Pop-up bloqueado e falha de `startUpgrade` exibindo mensagem inline.

## Validação manual

1. Abrir a página inicial em uma janela anônima e clicar em `Assinar PROFISSIONAL`; confirmar que `/cadastro` é aberto.
2. Fazer login com uma conta que tenha negócio no plano Grátis.
3. Voltar para a página inicial e clicar em `Assinar PROFISSIONAL`.
4. Confirmar que a página de marketing permanece aberta e uma nova aba navega diretamente para o checkout do Mercado Pago.
5. Cancelar ou concluir o checkout e confirmar que o retorno continua usando o fluxo de billing existente.
