# 0012 — O banco só aceita o segundo fator confirmado pelo app

**Status:** aceito

O limite de tentativas do código TOTP (`auth:mfa|user:<id>`, 10 a cada 15 minutos) fica na Server Action `verifyTotp`. Quem já sabe a senha do dono consegue uma sessão aal1 e chama `POST /factors/{id}/challenge` e `/factors/{id}/verify` direto no Supabase Auth, com a chave publicável, sem passar pelo contador (GHSA-vjcg). O Auth só limita essas chamadas por IP. O hook de tentativa de MFA, que resolveria o problema dentro do Auth, só existe nos planos Team e Enterprise, e o projeto está no Free. Um teste no Auth local (gotrue v2.195) mostrou que uma tentativa errada não deixa rastro no banco e que o mesmo desafio aceita vários palpites, então o banco não tem como contar os erros. Ele vê os acertos: o Auth marca `verified_at` em `auth.mfa_challenges`.

Por isso o aal2 só vale quando o código foi confirmado pelo app:

- `verifyTotp` passa pelo limite, cria o desafio e o registra com a sessão do JWT em `grant_mfa_challenge` (só service_role) antes de verificar. O desafio fica preso ao IP do servidor e o id não sai do servidor.
- Um trigger em `auth.mfa_challenges` roda dentro da transação do Auth. Desafio registrado: guarda a sessão em `private.mfa_verified_sessions`. Sem registro: guarda a verificação em `private.mfa_out_of_band_verifications`. O trigger não levanta erro, para que o registro da verificação direta fique gravado.
- `private.mfa_aal_allowed()`, usado pelo RLS e pelas RPCs do dono, exige de quem tem fator verificado aal2 numa sessão de `mfa_verified_sessions`. `getVerifiedAssurance` faz a mesma conta no app (`current_session_mfa_verified`) e trata o aal2 direto como aal1, então essa sessão volta para `/mfa`.
- Depois de uma verificação direta, `grant_mfa_challenge` recusa por 15 minutos. O código acertado fora do app expira antes de poder ser usado nele.
- Apagar um fator verificado exige `grant_mfa_factor_removal`, que `removeTotp` e `redeemMfaRecoveryCode` chamam antes. Sem isso, a sessão aal2 direta apagaria o fator no Auth e a conta voltaria a valer só com a senha. A exclusão do usuário passa pelo trigger, porque a cascata vem depois de `auth.users` perder a linha.

As sessões aal2 que já existiam quando a migration rodou ficaram valendo.

## Alternativas consideradas

- **Hook de tentativa de MFA do Supabase:** é a solução no lugar certo, mas exige o plano Team. Quando o projeto mudar de plano, o hook pode substituir esta ADR.
- **Contar desafios por fator no banco:** rejeitado, porque um desafio aceita vários palpites até expirar.
- **Fazer o trigger levantar erro na verificação direta:** rejeitado. O aal2 não sairia, mas a resposta 500 do acerto contra o 422 do erro continuaria revelando o código, e o rollback apagaria o registro que trava o app.
- **Verificar o TOTP no próprio app, com `verify_enabled = false` no Auth:** rejeitado, porque o JWT ficaria sempre aal1 (a sessão aal1 dura 15 minutos) e o app passaria a ler o segredo do fator.

## Consequências

- Quem acerta o código direto no Auth descobre que acertou, mas não usa a sessão nem consegue repetir o código pelo app. Para chegar lá, ainda precisa do primeiro acerto, cerca de 1 em 333 mil por palpite.
- Um teste ou ferramenta que confirme o TOTP direto no Auth recebe aal2 sem acesso. Os testes de integração usam `verifyTotpThroughApp`.
- Uma mudança no Auth que pare de marcar `verified_at` deixa todo segundo fator sem efeito no banco (falha fechada). O teste de integração `mfa-owner` cobre isso.

## Fontes

- GHSA-vjcg-chvf-mwqf
- `supabase/migrations/20261031060000_mfa_verified_by_app.sql`
- `lib/auth/mfa-grants.ts`, `lib/auth/assurance.ts`
- `lib/auth/actions.ts` (`verifyTotp`, `removeTotp`, `redeemMfaRecoveryCode`)
- `tests/integration/mfa-owner.integration.ts`
- [0009 — Códigos de recuperação desativam o autenticador](0009-codigos-de-recuperacao-do-mfa.md)
