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
  evento `http.request` com método e caminho, sem query string. Em 25/09/2026,
  um login inválido com dados descartáveis, feito na URL isolada do deploy de
  produção, retornou o erro esperado e gerou `auth.login_failed` na fonte.
  O JSON recebido tinha apenas `event`, `actorId: null` e horário, sem e-mail
  nem senha. A sessão existente do proprietário não foi encerrada.
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
  e 3 clientes. Nenhum SQL em claro foi gravado em disco. O Docker Desktop
  voltou a iniciar após a remoção, com ele parado, de cinco sockets temporários
  AF_UNIX obsoletos. Nenhum volume ou imagem foi apagado.
  O mesmo artifact foi carregado em uma segunda instância Supabase local com
  PostgreSQL 17 e as 63 migrações atuais. As contagens das 14 tabelas coincidiram
  com as do dump. Das 17 chaves estrangeiras verificadas, nenhuma referência
  entre tabelas `public` ficou órfã; três perfis referenciam contas ausentes em
  `auth.users`, que está fora do escopo do artifact. Um ensaio repetido, com
  reset da instância isolada, migrações, carga e conferência de contagens levou
  36,1 segundos. Esse tempo não inclui baixar o artifact, obter a chave,
  provisionar um novo host, recuperar Auth ou restaurar o tráfego da aplicação.
  Uma consulta RLS com identidade simulada retornou 1 negócio para o dono e 0
  para um usuário externo. O laboratório usa `auto_expose_new_tables = false`;
  foi necessário conceder `SELECT` em `public.businesses` a `authenticated`
  somente no laboratório para reproduzir o acesso da Data API hospedada.

## Configuração externa necessária

1. **Supabase:** os logs de auditoria do Auth foram consultados no Logs Explorer;
   os eventos do desafio TOTP estavam presentes. A gravação duplicada na tabela
   do banco permanece desligada. A proteção nativa contra senhas vazadas exige
   o plano Pro e não pode ser ligada no plano Free atual. O teste automatizado
   de TOTP e dos três papéis passou com contas descartáveis; uma revisão manual
   da interface por um usuário final ainda é recomendada.
2. **Cloudflare:** testar uma reserva legítima após a troca do DNS e confirmar
   nos logs se `x-real-ip` identifica um IP da Cloudflare; o código confia em
   `CF-Connecting-IP` somente nesse caso. Atualizar a lista de faixas oficiais
   da Cloudflare quando ela mudar. O HSTS já está em `next.config.ts`.
3. **Vercel:** eventos de acesso e auditoria chegaram à Better Stack em teste.
   O plano Hobby não oferece Log Drains; o envio é feito pela própria aplicação.
   Revisar periodicamente quem pode editar Secrets. Não registrar URLs
   completas, tokens ou dados de clientes.
4. **Backup:** o workflow `database-backup.yml` gera um dump diário de `public`
   às 03:17 UTC, comprime e cifra com AES-256-GCM sem gravar SQL em claro e
   retém o artifact por 30 dias. As primeiras execuções manual e agendada
   passaram, e o artifact manual foi restaurado em um banco isolado. Meta inicial:
   RPO de 24 horas e RTO de 8 horas. O RPO não é garantido pelo atraso observado
   no agendamento; o tempo de 36,1 segundos é apenas do ensaio local com o
   artifact pequeno e não comprova o RTO de uma recuperação integral.
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
3. Passar a chave somente pelo ambiente `BACKUP_ENCRYPTION_KEY`. Validar com
   `node scripts/backup/decrypt-file.mjs <arquivo>.aes256gcm --verify`. Na
   instância local descartável cujo contêiner se chama
   `supabase_db_af-restore-<nome>`, executar
   `node scripts/backup/restore-to-local-docker.mjs <arquivo>.aes256gcm supabase_db_af-restore-<nome>`.
   O utilitário autentica a cifra e o gzip, exige tabelas vazias, usa uma
   transação e envia SQL diretamente ao `psql` sem arquivo em claro. Ele aceita
   apenas nomes de contêiner com esse prefixo; nunca o banco normal `projeto`.
   A carga usa `supabase_admin` com triggers temporariamente desativadas na
   sessão, pois `businesses` e `subscriptions` têm chaves estrangeiras circulares.
4. Conferir contagens e referências de todas as tabelas. No ensaio de 25/09,
   as 14 contagens coincidiram, as 17 FKs foram verificadas e a RLS isolou o
   dono de um usuário externo com identidades simuladas. Ao usar um projeto
   local com `auto_expose_new_tables = false`, conferir os `GRANT` de Data API
   além da RLS; o laboratório exigiu uma concessão de `SELECT` em
   `public.businesses` para `authenticated` nesse teste. Recriar contas Auth por
   processo separado antes de testar login, cobrança e reservas com usuários
   reais. Medir o tempo total antes de declarar o RTO cumprido.

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
