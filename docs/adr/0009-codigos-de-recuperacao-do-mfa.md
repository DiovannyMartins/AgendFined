# 0009 — Códigos de recuperação desativam o autenticador

**Status:** aceito

O dono ativa a autenticação em duas etapas com um aplicativo autenticador (TOTP) e o painel exige aal2. Até o #169, quem perdia ou trocava o celular ficava trancado fora da conta: a única saída era remover o fator direto no Supabase. O Supabase Auth não oferece códigos de recuperação nativos, então o app passa a ter os seus.

Ao confirmar o primeiro código do autenticador, a Server Action `generateMfaRecoveryCodes` gera dez códigos de uso único (10 símbolos Crockford base32, 50 bits cada, exibidos como `XXXXX-XXXXX` e lidos como o código público, ADR 0004). Eles aparecem uma única vez e a ativação só termina depois de o dono marcar que os guardou. Por isso o `/mfa?next=` só devolve uma sessão aal2 ao destino quando ela já tem códigos: confirmar o autenticador grava o cookie aal2 e re-renderiza a página, que antes mandava o dono embora antes de ele ver os códigos. Gerar de novo, pela tela `/mfa`, troca todos os códigos. O banco guarda só o digest SHA-256 de `user_id:código` em `mfa_recovery_codes`, no molde do token de cancelamento (ADR 0005); incluir o usuário evita que o mesmo código tenha o mesmo hash em duas contas.

O código só responde ao desafio do login: a sessão já passou pela senha e ainda é aal1 com um fator verificado. `redeemMfaRecoveryCode` divide o rate limit com o código do autenticador (`auth:mfa|user:`), apaga o código na RPC `consume_mfa_recovery_code` e remove os fatores pela API admin do Auth (`auth.admin.mfa.deleteFactor`, server-only). A sessão segue em aal1 sem fator, o dono entra no painel e a tela pede que ative um novo autenticador. Os códigos restantes são apagados, o dono recebe um e-mail de aviso (como o de senha alterada, #149) e o uso fica na auditoria (`auth.mfa_recovery_code_used`). Remover o autenticador pela tela também apaga os códigos.

Tabela e RPCs (`replace_`, `consume_`, `clear_` e `count_mfa_recovery_codes`) ficam restritas à service role; o navegador nunca lê nem escreve digests.

## Alternativas consideradas

- **Segundo autenticador como reserva:** rejeitado como saída principal, porque só ajuda quem se preparou antes. O limite de fatores (`max_enrolled_factors`) continua permitindo isso no futuro.
- **Fluxo de suporte com remoção manual do fator:** rejeitado, porque exige verificação de identidade, um canal operado por pessoas e acesso ao painel do Supabase, que é justamente o que a issue quer evitar.
- **Código de recuperação que substitui o segundo fator (sessão aal2) sem desativar o autenticador:** rejeitado, porque o dono continuaria sem o celular e gastaria um código a cada login; desativar obriga a reativar com um aparelho que ele tem.
- **Gastar o código só depois de remover os fatores:** rejeitado, porque duas tentativas simultâneas usariam o mesmo código. A RPC apaga o código antes; se o Auth falhar em seguida, os demais códigos continuam valendo para outra tentativa.

## Consequências

- Quem já tinha o autenticador ativo antes desta mudança não tem códigos; a tela `/mfa` avisa e oferece gerá-los.
- Quem perder o celular e também os códigos continua sem saída pelo app.
- Quem conhece a senha e um código entra sem o celular; por isso o uso dispara o e-mail de aviso.

## Fontes

- Issue #169 (item 19 do beta test, #149)
- `supabase/migrations/20261023010000_mfa_recovery_codes.sql`
- `lib/auth/recovery-codes.ts`
- `lib/auth/actions.ts` (`generateMfaRecoveryCodes`, `redeemMfaRecoveryCode`, `removeTotp`)
- `lib/email/mfa-recovery-used.ts`
- `app/mfa/mfa-panel.tsx`
