# Plano de execução — checklist de lançamento

Este diretório descreve como revisar e preparar o AgendFined para o lançamento usando os 50 itens da checklist da [Wix](https://pt.wix.com/blog/checklist-novo-site).

O item 49 (internacionalização/site multilíngue) está **fora do escopo** por decisão do responsável e não é pendência.

## Situação consolidada — 6 de outubro de 2026

**Veredito: parcialmente concluído.** 36 dos 49 itens em escopo estão `[x]` (≈ 73%); 8 `[~]`, 3 `[!]` e 2 `[ ]`.

| Fase | Situação |
| --- | --- |
| 1 — Auditoria e planejamento | concluída |
| 2 — Qualidade visual e conteúdo | parcial: 13 (vídeo), 29 e 42 (feedback e usabilidade humanos, não iniciados) |
| 3 — SEO e acessibilidade | parcial: 32 (auditoria completa) e 44 (sitemap enviado, aguardando processamento) |
| 4 — Conversão e comunicação | parcial: 19 (formulário de interesse sem envio real registrado), 34 (só e-mail, sem chat/SLA); bloqueada: 38, 39, 47 |
| 5 — Métricas, segurança e desempenho | parcial: 2 e 46 (após o deploy das fontes: desempenho 78, LCP 4,8 s; meta 2,5 s), 50 (sem responsável/SLA). Item 45 confirmado em tempo real. |

Distinção usada nos documentos: **implementado** (código pronto), **validado localmente** (testes/lint/build), **validado em produção** (evidência no domínio ou nos provedores) e **aprovado** (decisão humana registrada).

## Correções da revisão final

- **E2E de reserva** (`tests/e2e/booking.spec.ts`, `tests/support/remote-write-guard.ts`): só escreve com `ALLOW_REMOTE_E2E_WRITES=true` **e** host de `NEXT_PUBLIC_SUPABASE_URL` listado em `E2E_ALLOWED_SUPABASE_HOSTS` (e fora de `E2E_FORBIDDEN_SUPABASE_HOSTS`); caso contrário é pulado. IDs únicos por execução, dados sintéticos (`example.com`), erros do seed verificados, “amanhã” calculado em `America/Sao_Paulo`, e `afterAll` remove reservas, lista de espera, clientes, bloqueios, disponibilidade, serviços, assinaturas, o negócio e o usuário Auth criados — apenas pelos IDs desta execução, mesmo após falha. **Ainda não executado** com a proteção.
- **Runner Playwright** (`playwright.config.ts`): servidor `node … next start` na porta 3100 (sem `npm run`, sem reutilizar servidor por padrão, `SIGTERM` no encerramento). Use `npm run test:e2e:safe` (build + specs sem escrita). `E2E_SERVER=dev` volta ao `next dev`.
- **Drill de restauração:** asserção `auth.users > 0`, contagens não vazias, `bash -euo pipefail`, `find -print -quit` e artefato restrito ao branch padrão. O arquivo `.github/workflows/` é protegido para edição remota; a versão corrigida está em [backup-restore-drill.proposto.yml](./backup-restore-drill.proposto.yml) e precisa ser copiada para `.github/workflows/backup-restore-drill.yml`. `tests/support/workflow-guards.test.ts` falha até isso ser feito.
- **Formulário de interesse:** e-mails em texto tinham `\n` literal; honeypot era rejeitado em vez de aceito silenciosamente; texto “Inscrição recebida” virou “Interesse registrado”. Testes da action e do envio adicionados.
- **Analytics:** CSP ampliada para `*.googletagmanager.com` e `*.analytics.google.com` (possível causa do “nenhum hit”); testes de `gtag`/`dataLayer` e da CSP.
- **Documentação:** itens 29 e 42 reintroduzidos; 22 aparece só na Fase 4; 19, 34 e 38 com status honestos; 44 distingue enviado/processado/indexado. `npm run check:checklist` valida numeração, duplicatas, item 49, status e links.

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

| Ação | Plataforma | Responsável esperado | Concluída quando |
| --- | --- | --- | --- |
| Executar o drill de restauração (workflow já atualizado no PR #47) | GitHub Actions | responsável pelo repositório | execução verde com `auth.users > 0` |
| Acompanhar sitemap (item 44) | Search Console | responsável pelo lançamento | status “Processado” e páginas indexadas |
| Reduzir LCP mobile ou aprovar novo limite (2, 46) | PageSpeed/produção | engenharia + responsável | LCP ≤ 2,5 s ou limite aprovado por escrito |
| Auditoria de acessibilidade (32) | navegador + leitor de tela | QA | [auditoria-acessibilidade.md](./auditoria-acessibilidade.md) preenchido |
| Feedback e usabilidade (29, 42) | sessões com pessoas | produto | [roteiro-feedback-e-usabilidade.md](./roteiro-feedback-e-usabilidade.md) preenchido |
| Definir responsável, substituto e SLA (34, 50) | — | responsável pelo lançamento | campos preenchidos em [operacao-pos-lancamento.md](./operacao-pos-lancamento.md) |
| Decidir lista de contatos (38) e autorizar divulgação (39, 47) | Instagram/campanhas | responsável pelo lançamento | decisão e calendário aprovados |

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

