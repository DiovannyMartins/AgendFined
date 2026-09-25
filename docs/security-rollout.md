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
  de autenticação e gestão da equipe registram eventos JSON sem e-mail, senha
  ou código TOTP. A aplicação envia esses eventos diretamente à fonte HTTP
  Better Stack. O token fica como Secret de produção na Vercel; uma falha de
  ingestão não interrompe a requisição do cliente.
- RBAC: a migração `20261001000001_business_rbac.sql` cria membros por negócio
  com papéis `admin`, `editor` e `user`. O dono mantém poderes de administrador.
  Administradores gerem membros e cobrança; editores podem alterar agenda,
  serviços, reservas e lista de espera; usuários têm acesso de leitura. A
  configuração de equipe aceita o ID de uma conta já criada. A RLS protege o
  acesso direto à Data API; as funções privilegiadas
  de gestão da lista de espera conferem MFA e papel dentro do banco. As ações
  que usam chave de serviço exigem o papel correspondente antes de acessar os dados.

## Estado externo verificado em 25/09/2026

- Supabase: TOTP habilitado, sessão AAL1 limitada a 15 minutos e mínimo de 15
  caracteres salvo em Auth. O projeto está no plano Free e não oferece backups
  agendados no painel. As migrações `20261001000000` e `20261001000001`
  foram aplicadas ao projeto vinculado e a suíte de integração passou (87 testes).
  Em 25/09/2026, um teste adicional com cinco contas descartáveis verificou
  na Data API os papéis `admin`, `editor` e `user`, o isolamento de um usuário
  externo, o bloqueio da sessão AAL1 após cadastrar TOTP e a retomada do acesso
  depois do desafio AAL2. O teste passou e removeu as contas e o negócio criados.
  Os dois tokens temporários usados na implantação foram revogados; o token
  anterior do proprietário foi preservado.
- Cloudflare: o certificado Universal do domínio está ativo. O modo SSL/TLS é
  **Completo (estrito)**, **Sempre usar HTTPS** está ativo e a versão mínima é
  TLS 1.2. O CNAME `@` está **Com proxy** e o conjunto gerenciado gratuito do
  WAF está sempre ativo. O domínio respondeu com `Server: cloudflare`, HTTP
  redirecionou para HTTPS, `/login` respondeu 200 e `/dashboard` redirecionou
  para login.
- Vercel: o projeto Hobby guarda chaves privadas como variáveis Secret; o
  firewall básico e os logs de acesso estão ativos. A fonte HTTP Better Stack
  `AgendFined Vercel` foi criada e `BETTERSTACK_SOURCE_TOKEN` está salvo como
  Secret de produção. O deploy `0f31a6a` ficou pronto, e a Better Stack recebeu
  evento `http.request` com método e caminho, sem query string.
- GitHub: `SUPABASE_BACKUP_DB_URL` e `BACKUP_ENCRYPTION_KEY` estão em Actions
  Secrets. A credencial de backup é somente leitura para `public`, com
  `BYPASSRLS` para o dump completo das tabelas da aplicação. Um dump de teste
  criptografado foi criado e verificado localmente. A primeira execução manual
  do workflow (`36083817594`) passou e enviou o artifact cifrado
  `agendfined-db-36083817594`, com expiração em 25/10/2026. O artifact foi
  baixado do GitHub e autenticado com a chave de recuperação, sem salvar SQL em
  claro. A primeira execução agendada (`36115156477`) também passou e gerou
  artifact com 30 dias de retenção. Ela começou às 08:50 UTC, depois do horário
  nominal de 03:17 UTC; o agendamento do GitHub pode atrasar.
  Em 25/09/2026, o artifact manual foi autenticado novamente e o SQL foi
  analisado em memória: 14 tabelas `public`, incluindo 3 negócios, 16 reservas
  e 3 clientes. Nenhum SQL em claro foi gravado em disco. A carga em um banco
  isolado ainda não foi executada: o Docker Desktop desta estação falhou ao
  iniciar o mecanismo Linux por erro de acesso a `sailor-ingest.sock`, inclusive
  após reinicialização sem apagar volumes. Integridade do artifact está
  confirmada; integridade de uma restauração e RTO ainda não estão confirmados.

## Configuração externa necessária

1. **Supabase:** conferir os logs de auditoria do Supabase Auth e ativar a
   proteção contra senhas vazadas se o plano permitir. O teste automatizado de
   TOTP e dos três papéis passou com contas descartáveis; uma revisão manual da
   interface por um usuário final ainda é recomendada.
2. **Cloudflare:** testar uma reserva legítima após a troca do DNS e confirmar
   nos logs se `x-real-ip` identifica um IP da Cloudflare; o código confia em
   `CF-Connecting-IP` somente nesse caso. Atualizar a lista de faixas oficiais
   da Cloudflare quando ela mudar. O HSTS já está em `next.config.ts`.
3. **Vercel:** gerar um evento de auditoria de teste e verificar sua chegada na
   Better Stack. O plano Hobby não oferece Log Drains; o envio é feito pela
   própria aplicação. Revisar quem pode editar Secrets. Não registrar URLs
   completas, tokens ou dados de clientes.
4. **Backup:** o workflow `database-backup.yml` gera um dump diário de `public`
   às 03:17 UTC, comprime e cifra com AES-256-GCM sem gravar SQL em claro e
   retém o artifact por 30 dias. As primeiras execuções manual e agendada
   passaram, e o artifact manual foi baixado e autenticado. Meta inicial: RPO de
   24 horas e RTO de 8 horas, ainda sem garantia pelo atraso observado no
   agendamento e porque falta carregar o artifact em um banco isolado.
   Guardar a chave de recuperação em um gerenciador de senhas ou em papel,
   fora do GitHub e deste computador; o Secret do GitHub não pode ser revelado
   depois da gravação. O proprietário confirmou uma cópia em papel em
   24/09/2026; o arquivo temporário legível foi apagado.
   Nesta estação Windows, a cópia local da chave está protegida com DPAPI para
   o usuário atual em `.backup-local/` (ignorado pelo Git). Executar
   `pwsh -NoProfile -File scripts/backup/copy-local-recovery-key.ps1`
   copia **somente** a chave AES para a área de transferência, caso seja
   necessário guardá-la novamente em um cofre. Limpar a área de transferência
   em seguida. A cópia DPAPI não substitui a folha guardada fora deste computador.

### Recuperação do backup externo

1. Em GitHub Actions, baixar o artifact `agendfined-db-<run_id>` de uma execução
   concluída. Obter a chave AES de 64 caracteres hexadecimais da folha de
   recuperação guardada pelo proprietário. O arquivo cifrado sozinho não
   permite recuperar dados.
2. Criar um projeto Supabase **isolado** e aplicar as migrações do repositório.
   Nunca restaurar primeiro em produção. O projeto de destino precisa ter
   PostgreSQL 17 e espaço suficiente para os dados.
3. Passar a chave somente pelo ambiente `BACKUP_ENCRYPTION_KEY`. Usar
   `node scripts/backup/decrypt-file.mjs <arquivo>.aes256gcm --verify` para
   validar autenticação e integridade. Para restaurar, usar o modo de saída
   do mesmo script e enviar o SQL descomprimido diretamente ao `psql`, sem
   arquivo em claro. Desativar triggers durante a carga com conta administrativa,
   pois `businesses` e `subscriptions` têm chaves estrangeiras circulares.
4. Conferir contagens de linhas, login, isolamento RLS, cobrança e reservas;
   medir o tempo real antes de declarar a meta RTO cumprida.

**Limite da cópia:** a conta somente leitura autorizada não recebe `USAGE` no
esquema `auth` nem `SELECT` em `storage.migrations` no Supabase hospedado. O
artifact cobre as tabelas `public`. Não recupera senhas/contas do Supabase Auth,
metadados do Storage nem arquivos dos buckets. Para recuperação completa,
contratar backups gerenciados do Supabase ou estabelecer um mecanismo adicional
com permissões específicas e aprovação separada. Atualmente não há objetos em
Storage, mas o cadastro de usuários exigiria recriação após perda total do
projeto Supabase.

## Decisões de produto

- **AES-256:** a pedido do proprietário, a cifra de aplicação cobre backups;
  segredos ficam no Vercel Env Manager e GitHub Actions Secrets. Os dados
  pesquisáveis de clientes não são cifrados por coluna. Hash de senha é função
  do Supabase Auth.
- **Rotação de senha a cada 90 dias:** o proprietário dispensou essa exigência.
  A política usa senha longa, MFA e troca obrigatória quando houver
  comprometimento.

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
