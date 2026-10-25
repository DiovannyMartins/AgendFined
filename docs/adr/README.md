# Architecture Decision Records

Decisões de arquitetura difíceis de reverter, que surpreenderiam quem lê o código sem contexto e que resultaram de uma escolha real entre alternativas. O vocabulário segue o [`CONTEXT.md`](../../CONTEXT.md).

## Formato

- Um arquivo por decisão, numerado em sequência: `0001-slug.md`, `0002-slug.md`… Para um novo ADR, use o maior número existente mais um.
- Título curto com a decisão e um a três parágrafos: contexto, o que foi decidido e por quê.
- Seções opcionais só quando agregam: **Status** (`proposto`, `aceito`, `obsoleto`, `substituído por ADR-NNNN`), **Alternativas consideradas** e **Consequências**.
- Cite as fontes (migrations, specs, módulos) para que o leitor confira a decisão no código.
- Para reabrir uma decisão, escreva um ADR novo que substitua o antigo e marque o antigo como substituído. Não reescreva o histórico.

Os ADRs 0001 a 0006 foram registrados retroativamente em 17/10/2026, a partir do que já estava decidido e documentado no `CONTEXT.md`, nas specs, no README e nas migrations. Eles não introduzem decisões novas.

## Índice

- [0001 — Datas em UTC, interpretadas no fuso do negócio](0001-fuso-do-negocio.md)
- [0002 — Snapshot do serviço na reserva](0002-snapshot-da-reserva.md)
- [0003 — Exclusion constraint como guarda final contra sobreposição](0003-exclusion-constraint-sobreposicao.md)
- [0004 — Código público curto em Crockford base32](0004-codigo-publico-crockford.md)
- [0005 — Token de cancelamento independente, armazenado só como digest](0005-token-de-cancelamento.md)
- [0006 — Leituras e escritas públicas por RPCs com allowlist](0006-rpcs-publicas-com-allowlist.md)
- [0007 — Slug antigo reservado ao negócio e redirecionado ao atual](0007-slug-antigo-reservado-e-redirecionado.md)
- [0008 — Carência do cancelamento mantém o mês já pago](0008-carencia-mantem-o-mes-pago.md)
- [0009 — Códigos de recuperação desativam o autenticador](0009-codigos-de-recuperacao-do-mfa.md)
- [0010 — Remarcar move a mesma reserva](0010-remarcar-move-a-mesma-reserva.md)
- [0011 — E-mail opcional na reserva pública e lembrete manual pelo WhatsApp](0011-email-opcional-e-lembrete-pelo-whatsapp.md)
