# AgendFined — instruções para agentes

## Contexto obrigatório

Antes de alterar um domínio, leia [`CONTEXT.md`](CONTEXT.md) e os ADRs relevantes em [`docs/adr/`](docs/adr/). Use o vocabulário canônico do projeto: negócio, cliente, serviço, disponibilidade, faixa, bloqueio, slot, reserva, lista de espera, plano e assinatura.

## Arquitetura

- Next.js App Router com TypeScript e React.
- Supabase PostgreSQL é a fonte de verdade para persistência, RLS, RPCs e constraints.
- Server Actions e módulos server-only preservam as fronteiras de segurança; nunca exponha service role ou segredos ao cliente.
- Mudanças de schema exigem uma nova migration em `supabase/migrations/` e atualização dos tipos quando necessário.
- Preserve snapshots e invariantes de concorrência das reservas; mudanças em disponibilidade, reservas, billing ou segurança devem consultar os ADRs correspondentes.

## Feedback loop

Após mudanças de código, execute o menor conjunto relevante e, quando possível, feche com:

```text
npm run lint
npm run typecheck
npm test
```

Para mudanças de fluxo público ou dashboard, considere também `npm run test:e2e:safe`.

## Workflow de engenharia

- Para trabalho novo, leia a spec relacionada em `specs/` antes de implementar.
- Para bugs difíceis ou regressões de desempenho, use `diagnosing-bugs`.
- Para features ou correções com mudança comportamental, prefira `tdd` e uma fatia vertical pequena.
- Para mudanças de contrato ou módulo, consulte `codebase-design` e `domain-modeling`.
- Para revisão, compare a mudança com a spec e os padrões do projeto usando `code-review`.
- Não altere arquivos `.env`, artefatos de build ou dados remotos como parte de uma implementação comum.

## Agent skills

### Issue tracker

Issues e specs são acompanhadas no GitHub Issues. Use `gh` conforme `docs/agents/issue-tracker.md`.

### Triage labels

Use as cinco labels padrão documentadas em `docs/agents/triage-labels.md`.

### Domain docs

Este é um repositório single-context: `CONTEXT.md` contém o vocabulário do domínio e `docs/adr/` contém decisões arquiteturais. Consulte `docs/agents/domain.md` para as regras de leitura.
