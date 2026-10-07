# Auditoria de acessibilidade (item 32)

**Estado:** parcial. A auditoria automatizada das rotas públicas foi feita e está sem violações; faltam leitor de tela e as rotas que dependem de dados (painel e páginas de negócio).

## Verificado por inspeção de código nesta revisão

- `lang="pt-BR"` no documento; skip link “Pular para o conteúdo” no marketing, autenticação e painel.
- Formulário de interesse: label associado ao e-mail, checkbox dentro do `label`, erro com `role="alert"`, honeypot fora da ordem de tabulação (`tabIndex={-1}`, `aria-hidden`).
- Vídeo da hero decorativo (`aria-hidden`, `alt=""` no poster) e desativado com `prefers-reduced-motion`; o conteúdo não depende do vídeo.
- Viewport de 320 px coberto pelo projeto `mobile` do Playwright.

## Roteiro a executar

1. **Automatizado:** `@axe-core/playwright` (ou extensão axe DevTools) em `/`, `/login`, `/cadastro`, `/recuperar-senha`, `/privacidade`, `/termos`, 404, `/{slug}`, `/{slug}/consultar`, `/{slug}/confirmacao` e, autenticado, `/dashboard`, `/dashboard/servicos`, `/dashboard/agenda`, `/dashboard/configuracoes`. Registrar violações por impacto.
2. **Teclado:** percorrer cada rota só com Tab/Shift+Tab/Enter/Espaço/Esc; conferir ordem, foco visível, menu do painel, diálogo de suporte (foco preso e retorno ao gatilho) e confirmação de cancelamento.
3. **Contraste e zoom:** tema escuro em 200% de zoom e 320 px sem rolagem horizontal.
4. **Formulários:** login, cadastro, recuperação, interesse, configuração e reserva — labels, mensagens de erro anunciadas, foco no primeiro erro.
5. **Leitor de tela:** NVDA (Windows) ou VoiceOver (iOS) no fluxo de reserva pública e no cadastro; conferir anúncios de slots, estados de carregamento e confirmação.

## Registro

| Data | Rota | Ferramenta/método | Problema | Impacto | Correção/decisão |
| --- | --- | --- | --- | --- | --- |
| 06/10/2026 | `/` | axe 4 (`@axe-core/playwright`), desktop e 360 px | `color-contrast`: textos `text-white/40–45` da prévia de agenda (4,46:1) | sério | trocado para `text-white/60` |
| 06/10/2026 | `/login`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha` | axe | `page-has-heading-one` | moderado | título do card exposto como `role="heading" aria-level={1}` |
| 06/10/2026 | `/privacidade`, `/termos` | axe | `landmark-one-main` e `region` | moderado | layout com `<header>`, `<main id="main-content">` e `<footer>` |
| 06/10/2026 | 8 rotas públicas (inclui 404) | axe, desktop e 360 px | nova execução após as correções | — | **0 violações**; sem rolagem horizontal em 360 px |

O item 32 só vira `[x]` com axe e verificação manual registrados; sem leitor de tela, permanece `[~]`.
