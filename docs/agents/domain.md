# Domain docs

O AgendFined é um repositório single-context.

## Antes de explorar

- Leia `CONTEXT.md` na raiz; ele é o glossário canônico local do domínio e contém termos preferidos e termos a evitar.
- Leia os ADRs em `docs/adr/` que toquem a área da mudança.
- Leia a spec correspondente em `specs/` quando o trabalho vier de uma feature ou issue especificada.

## Regras de vocabulário

Use os termos definidos em `CONTEXT.md` em código novo, issues, specs, testes e propostas. Se um conceito necessário não estiver documentado, trate isso como uma lacuna para `domain-modeling`, em vez de inventar um sinônimo.

## ADRs

Se uma proposta contradizer um ADR existente, mencione explicitamente o ADR e explique por que ele deve ser reaberto ou substituído. Não silencie a contradição.

## Estrutura

```text
/
├── CONTEXT.md
├── docs/adr/
├── docs/agents/
├── specs/
└── app/, components/, lib/, supabase/
```
