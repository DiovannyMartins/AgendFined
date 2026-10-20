# 0007 — Slug antigo reservado ao negócio e redirecionado ao atual

**Status:** aceito

Trocar o slug em Configurações fazia o link público já divulgado (`/<slug-antigo>`, em WhatsApp, Instagram ou QR Code impresso) dar 404 (issue #124). Agora, cada slug que um negócio deixa de usar entra em `business_slug_history`, e `/<slug-antigo>` e `/<slug-antigo>/consultar` respondem com redirect permanente (308) para o mesmo caminho no slug atual. Trocas encadeadas (x → y → z) levam direto ao slug atual. Os links de confirmação já seguiam o slug atual pelo código público (ADR 0004).

O slug antigo fica reservado ao negócio enquanto ele existir. Nenhum outro negócio pode escolhê-lo, nem no setup nem em Configurações. O banco recusa com `23505`, o mesmo erro de slug em uso. Assim, um link divulgado nunca passa a levar ao negócio de outra pessoa. O próprio negócio pode voltar a um slug antigo, que então sai do histórico. Excluir o negócio libera os slugs antigos pela cascata. O redirect só vale para negócio ativo, como a página pública.

A regra fica no banco, num trigger `security definer` em `businesses`, porque o dono troca o slug com a própria sessão e a API REST não passa pelas Server Actions. Um advisory lock por slug serializa quem libera e quem toma o mesmo slug, o que fecha a corrida em que A troca x por y enquanto B escolhe x. O histórico tem RLS sem políticas e nenhum grant para `anon` ou `authenticated`. A leitura pública passa pela RPC `get_business_slug_redirect`, que devolve só o slug atual (ADR 0006). As páginas só a chamam quando `get_public_business` não encontra o slug, então o caminho comum não ganha nenhuma consulta. Se essa busca falhar, a resposta continua sendo 404.

## Alternativas consideradas

- **Reservar o slug antigo por um prazo (ex.: 12 meses):** rejeitado por enquanto. Exige uma regra de expiração, e um QR Code impresso pode durar mais que o prazo. Se slugs presos virarem problema, um ADR novo pode introduzir a expiração.
- **Não reservar (o primeiro que escolher o slug fica com ele):** rejeitado. O link antigo passaria a levar a outro negócio sem aviso.
- **Redirect temporário (307):** rejeitado. O 308 faz os buscadores trocarem a URL indexada. As páginas públicas são dinâmicas e respondem com `Cache-Control: no-store`, então nenhum navegador guarda o redirect. Por isso, voltar ao slug antigo não cria loop.
- **`get_public_business` resolvendo também o slug antigo:** rejeitado. Mudaria o contrato de uma RPC usada por outros fluxos, e cada caller teria que comparar o slug devolvido com o da URL.

## Fontes

- `supabase/migrations/20261019000000_business_slug_history.sql`
- `lib/business/public-business.ts`
- `tests/integration/business-slug-history.integration.ts`
- `app/dashboard/configuracoes/business-form.tsx` — aviso ao trocar o slug
