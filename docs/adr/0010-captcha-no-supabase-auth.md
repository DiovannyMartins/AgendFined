# CAPTCHA verificado pelo Supabase Auth, só no projeto remoto

Login, cadastro e recuperação de senha também podem ser chamados direto na API do Supabase Auth com a chave pública, sem passar pelo Turnstile e pelo rate limit das Server Actions. Por isso a proteção CAPTCHA (Turnstile) fica ligada no Supabase Auth do projeto remoto: os formulários enviam o token como `captchaToken` e quem verifica é o Supabase. O app não pré-verifica o token porque cada token só pode ser usado uma vez. Essa configuração vive no painel do Supabase (Authentication → Attack Protection), com o secret do mesmo widget de `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, e não aparece no repositório: o `supabase/config.toml` mantém `[auth.captcha]` desligado no stack local.

## Consequences

- Qualquer script ou teste que faça login, cadastro ou recuperação de senha direto no Supabase **remoto** recebe `400 captcha_failed`, porque não tem como obter um token válido. Isso inclui `anonClientForUser` nos testes de integração e o passo de login de `tests/e2e/booking.spec.ts` quando rodam contra o remoto. Rode-os contra o stack local (`npx supabase start` + `npm run test:integration:local`), onde não há CAPTCHA.
- O token de teste da Cloudflare não resolve: ele só passa com o secret de teste, e o projeto remoto usa o secret real.
- Criar usuários pela service role (`auth.admin.createUser`) continua funcionando no remoto, porque não passa pelo CAPTCHA.
- Ligar o CAPTCHA antes do deploy dos formulários que enviam `captchaToken` derruba todos os logins. Desligar o toggle no painel reverte na hora.
