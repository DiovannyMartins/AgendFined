# Plano de execução — checklist de lançamento

Este diretório descreve como revisar e preparar o AgendFined para o lançamento usando os 50 itens da checklist da [Wix](https://pt.wix.com/blog/checklist-novo-site).

**Fora do escopo por decisão do responsável:** 19 (formulário de e-mail), 29 (feedback de terceiros), 38 (lista de contatos), 39 e 47 (divulgação e campanhas), 42 (teste de usabilidade) e 49 (site multilíngue). Não são pendências.

**Aceitos no estado atual pelo responsável (6 de outubro de 2026):** 2 e 46 (desempenho 81, LCP simulado 4,7 s acima da meta interna de 2,5 s), 13 (vídeo decorativo da hero, desligado no celular), 32 (axe sem violações e fluxo de reserva revisado; sem teste com leitor de tela), 34 (suporte só por e-mail, sem chat ao vivo) e 50 (runbook sem responsável/SLA definidos).

## Situação consolidada — 7 de outubro de 2026

**Veredito: concluído, com itens aceitos pelo responsável.** Os 43 itens em escopo estão `[x]`; seis deles (2, 13, 32, 34, 46 e 50) foram aceitos no estado atual sem atingir a meta original, conforme registrado abaixo.

| Fase | Situação |
| --- | --- |
| 1 — Auditoria e planejamento | concluída |
| 2 — Qualidade visual e conteúdo | concluída |
| 3 — SEO e acessibilidade | concluída (sitemap processado e 2 páginas indexadas em 7/10) |
| 4 — Conversão e comunicação | concluída |
| 5 — Métricas, segurança e desempenho | concluída |

Distinção usada nos documentos: **implementado** (código pronto), **validado localmente** (testes/lint/build), **validado em produção** (evidência no domínio ou nos provedores) e **aprovado** (decisão humana registrada).

## O que foi feito

- **E2E de reserva** (`tests/e2e/booking.spec.ts`, `tests/support/remote-write-guard.ts`): só escreve com `ALLOW_REMOTE_E2E_WRITES=true` e host autorizado em `E2E_ALLOWED_SUPABASE_HOSTS`; IDs aleatórios por execução (`node:crypto`), dados sintéticos e limpeza garantida em `afterAll`. Passou em 6 de outubro de 2026.
- **Runner Playwright** (`playwright.config.ts`): `next start` na porta 3100, sem `npm run` e sem reutilizar servidor; `E2E_SERVER=dev` usa `next dev` (necessário para o E2E de reserva, porque o Turnstile é fail-closed em build de produção).
- **Drill de restauração** (`.github/workflows/backup-restore-drill.yml`): `auth.users > 0`, contagens não vazias, `bash -euo pipefail` e artefato restrito ao branch padrão; run `37557120032` verde.
- **Analytics:** CSP com os coletores do GA4; hit confirmado em tempo real.
- **Desempenho:** fontes via `next/font` (LCP 9,8 s → 4,8 s); hero sem `backdrop-blur`/`mix-blend`, vídeo só em telas ≥ 768 px e após o `load`, Turnstile fora da home; home estática servida do cache (TTFB ~1,7 s → 85–300 ms; desempenho 81).
- **Acessibilidade:** axe nas rotas públicas com 0 violações após as correções; PageSpeed acessibilidade 100; fluxo de reserva com anúncios para leitor de tela.
- **Segurança:** dependências de produção com 0 vulnerabilidades (`next` 16.3.8, CLI do shadcn removido) e alertas do CodeQL corrigidos.
- **Formulário de interesse:** removido por decisão do responsável.
- **Documentação:** `npm run check:checklist` valida numeração, duplicatas, itens fora do escopo, status e links.

## Validação técnica — 6 de outubro de 2026

| Comando | Ambiente | Resultado |
| --- | --- | --- |
| `npm run lint` | computador do responsável (VM Linux, Node 22) | exit 0 |
| `npm run typecheck` | idem | exit 0 |
| `npx vitest run --project unit` | cópia Linux com dependências reinstaladas e drill proposto aplicado | exit 0 — 48 arquivos, 326 testes |
| `npx vitest run --project unit` | repositório sem aplicar o drill proposto | exit 1 — só `workflow-guards.test.ts` (esperado) |
| `npm run build` | cópia Linux | exit 0, 26 páginas |
| `npm run check:checklist` | idem | exit 0 |
| `git diff --check` (arquivos alterados) | computador do responsável | exit 0 |
| Playwright landing/seo/public, chromium, 2× | Linux, Supabase fictício | exit 1 nas duas (9 ok, 1 falha esperada: slug inexistente responde 500 sem Supabase real); terminou sozinho em ~12 s; 0 processos `next` e porta 3100 livre após cada execução |

### Execução no Windows — 6 de outubro de 2026, 20h57–21h00 (`scripts/run-pendencias.ps1`, Node 22.12.0)

| Etapa | Resultado |
| --- | --- |
| `npm run build` | exit 0, 29 s, 26 páginas (inclui fontes via `next/font`) |
| Playwright landing/seo/public — execução 1 | exit 0, 18 s, 10 passed; depois: 0 servidores de teste, porta 3100 livre, 0 processos Node |
| Playwright landing/seo/public — execução 2 | exit 0, 12 s, 10 passed; depois: 0 servidores de teste, porta 3100 livre, 0 processos Node |
| `npm run check:launch -- --production` | exit 0; `/`, `/robots.txt`, `/sitemap.xml`, CSP e canonical PASS; 1 aviso (segredo do scheduler de reconciliação) |
| Integração (`--project integration`, Supabase de produção, autorizado pelo responsável) | exit 0, 55 s, 13 arquivos, 88 testes |
| E2E de reserva — tentativa 1 (`next start`) | exit 1, 67 s: reserva recusada pelo Turnstile fail-closed do build de produção (ambiente local sem chaves). Limpeza sem erro. |
| E2E de reserva — tentativa 2 (`E2E_SERVER=dev`, 21h07) | exit 0, 138 s, 2 passed; limpeza sem erro. O e-mail de confirmação falhou (`provider_error`) porque o cliente de teste usa `@example.com`, que o Resend não entrega; a reserva não depende do e-mail. |

O travamento do Playwright no Windows não se reproduziu com a nova configuração.

## Pendências externas

Nenhuma. O acompanhamento contínuo está em [operacao-pos-lancamento.md](./operacao-pos-lancamento.md).

## Ordem recomendada

1. [Fase 1 — Auditoria e planejamento](./01-auditoria-e-planejamento.md)
2. [Fase 2 — Qualidade visual e conteúdo](./02-qualidade-visual-e-conteudo.md)
3. [Fase 3 — SEO e acessibilidade](./03-seo-e-acessibilidade.md)
4. [Fase 4 — Conversão e comunicação](./04-conversao-e-comunicacao.md)
5. [Fase 5 — Métricas, segurança e desempenho](./05-metricas-seguranca-e-desempenho.md)

## Regra de execução

Cada fase só deve ser marcada como concluída quando:

- a implementação estiver feita;
- os testes relevantes passarem;
- a verificação visual tiver sido realizada;
- a evidência estiver registrada;
- as dependências externas estiverem identificadas como concluídas ou pendentes.

Itens que exigem contas externas, publicação, DNS ou aprovação de conteúdo não devem ser considerados concluídos apenas porque o código foi preparado.

## Status dos itens

- `[ ]` não iniciado;
- `[~]` parcialmente concluído ou aguardando dependência;
- `[x]` concluído e verificado;
- `[!]` bloqueado por acesso, decisão ou recurso externo.

