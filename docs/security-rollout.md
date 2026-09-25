# Implantação dos controles de segurança

Este projeto usa Supabase Auth/Postgres e Vercel. Cada negócio tem um dono;
outros usuários podem receber papéis por negócio. A aplicação já usa RLS, limites de taxa compartilhados no
Postgres, Turnstile para reservas públicas, HSTS/CSP e chave de serviço apenas
no servidor.

## Controles implementados no repositório

- MFA TOTP: o proprietário ativa em `/mfa`; após a ativação, cada login precisa
  confirmar o código. A migração `20261001000000_mfa_opt_in_rls.sql` exige
  `aal2` nas tabelas da aplicação quando a conta tem fator verificado. A
  verificação de código tem limite por usuário. A página de configurações
  contém o acesso ao cadastro do autenticador.
- Senhas: cadastro e redefinição exigem ao menos 15 caracteres, com letras e números; o login aceita
  as senhas existentes. O Supabase Auth armazena senhas com bcrypt, sem que a
  aplicação receba o hash.
- Limites: login, cadastro, recuperação, reserva, consulta, busca e
  disponibilidade usam contadores compartilhados no Postgres, que falham
  fechados se o contador estiver indisponível. A verificação MFA segue o mesmo
  mecanismo. As rotas API de webhook, retorno de cobrança e reconciliação têm
  limites por IP. Webhook e cron também exigem assinatura ou segredo próprio.
- Logs: o proxy registra método e caminho sem query string em produção; ações
  de autenticação registram eventos JSON sem e-mail, senha ou código TOTP.
- RBAC: a migração `20261001000001_business_rbac.sql` cria membros por negócio
  com papéis `admin`, `editor` e `user`. O dono mantém poderes de administrador.
  Administradores gerem membros e cobrança; editores podem alterar agenda,
  serviços, reservas e lista de espera; usuários têm acesso de leitura. A
  configuração de equipe aceita o ID de uma conta já criada. A RLS protege o
  acesso direto à Data API, inclusive profissionais; as funções privilegiadas
  de gestão da lista de espera conferem MFA e papel dentro do banco. As ações
  que usam chave de serviço exigem o papel correspondente antes de acessar os dados.

## Estado externo verificado em 24/09/2026

- Supabase: TOTP habilitado, sessão AAL1 limitada a 15 minutos e mínimo de 15
  caracteres salvo em Auth. O projeto está no plano Free e não oferece backups
  agendados no painel. As duas migrações deste rollout ainda precisam ser
  aplicadas antes da publicação do código.
- Cloudflare: o certificado Universal do domínio está ativo. O modo SSL/TLS é
  **Completo (estrito)**, **Sempre usar HTTPS** está ativo e a versão mínima é
  TLS 1.2. O CNAME `@` está em **Somente DNS**; por isso, o WAF da Cloudflare
  ainda não recebe o tráfego da aplicação.
- Vercel: o projeto Hobby já guarda as chaves privadas como variáveis Secret nos
  ambientes configurados; o firewall básico e os logs de acesso estão ativos.
  A fonte Better Stack/Logtail ainda não está conectada.

## Configuração externa necessária

1. **Supabase:** aplicar as migrações pendentes com
   `npx supabase db push --linked` usando uma conta autorizada. Antes de publicar
   o novo código, conferir `supabase migration list --linked` e testar login,
   ativação TOTP, novo login,
   acesso direto à Data API com token `aal1` e `aal2` e os três papéis em um
   negócio de teste. Em Auth > Security,
   ativar proteção contra senhas vazadas se o plano permitir. Conferir os logs
   de auditoria do Supabase Auth.
2. **Cloudflare:** após publicar o suporte a `CF-Connecting-IP`, ativar o proxy
   do CNAME `@` para que as regras do WAF recebam tráfego. O certificado da
   origem Vercel deve continuar válido em modo **Full (strict)**. Testar
   HTTP→HTTPS, login e uma reserva legítima após a troca do DNS.
   O HSTS já está configurado em `next.config.ts`.
   Confirmar nos logs se `x-real-ip` identifica um IP da Cloudflare; o código
   confia em `CF-Connecting-IP` somente nesse caso. Atualizar a lista de faixas
   oficiais da Cloudflare quando ela mudar.
3. **Vercel:** revisar permissões de quem pode editar variáveis. Rotacionar
   qualquer segredo que tenha sido exposto e fazer novo deploy. Configurar o
   Log Drain da Vercel para uma fonte Better Stack/Logtail para logs de acesso
   e de aplicação; não registrar URLs completas, senhas, tokens ou dados de
   clientes em eventos de aplicação.
4. **Backup:** confirmar o plano Supabase. Pro/Team/Enterprise têm backup diário
   automático; verificar retenção no painel e considerar PITR se o RPO exigido
   for menor que um dia. Definir responsável, RPO/RTO, cópia fora do projeto e
   ensaio de restauração trimestral em projeto isolado. Meta inicial: RPO de
   24 horas e RTO de 8 horas, sujeitos à medição no primeiro ensaio. Backups do banco não
   incluem objetos do Storage; incluí-los no procedimento se Storage for usado.

## Decisões de produto ainda necessárias

- **AES-256:** segredos de aplicação pertencem ao Vercel Environment Variables,
  que são criptografados em repouso. Dados pesquisáveis de clientes exigem um
  plano próprio de criptografia de aplicação, busca e migração dos dados
  existentes. Hash de senha é função do Supabase Auth.
- **Rotação de senha a cada 90 dias:** a NIST SP 800-63B atual recomenda
  explicitamente não exigir trocas periódicas sem evidência de comprometimento.
  A política proposta é senha longa, bloqueio de senhas vazadas, MFA e troca
  obrigatória quando houver comprometimento.

## Referências

- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/auth/audit-logs
- https://supabase.com/docs/guides/platform/backups
- https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/
- https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/
- https://vercel.com/docs/environment-variables/manage-across-environments
- https://vercel.com/docs/vercel-firewall
- https://examples.vercel.com/docs/headers/request-headers
- https://vercel.com/docs/security/compliance
- https://pages.nist.gov/800-63-4/sp800-63b.html
