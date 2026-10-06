# Fase 1 — Auditoria e planejamento

## Objetivo

Entender o estado atual do site, definir o escopo do lançamento e transformar a checklist em tarefas executáveis.

**Status da fase:** concluída em 4 de outubro de 2026.

## Itens relacionados

- [x] 1. Analisar o que precisa ser alterado — auditoria registrada e inconsistência de domínio corrigida no código.
- [x] 3. Pesquisar concorrentes e tendências — três referências oficiais comparadas.
- [x] 4. Identificar objetivos — objetivos e metas mensuráveis adotados para o lançamento.
- [x] 5. Listar itens de ação — tarefas priorizadas com responsáveis, dependências e critérios de aceite.
- [x] 6. Confirmar a tecnologia do site — stack confirmada no código e no `package.json`.
- [x] 7. Confirmar hospedagem e provedor — produção confirmada em Vercel, com Supabase, Mercado Pago e Resend como provedores do produto.
- [x] 8. Definir data de publicação — 1º de dezembro de 2026, aprovada pelo responsável pelo lançamento.
- [x] 9. Documentar as etapas de criação — fluxo de navegação e sequência de preparação registrados.
- [x] 10. Definir o layout — layout implementado e inventariado; revisão visual operacional permanece como tarefa de QA.
- [x] 11. Planejar os elementos de design — tipografia, cores, imagens, espaçamento e responsividade registrados.
- [x] 12. Confirmar as páginas necessárias — inventário do escopo MVP concluído.

## Instruções

1. Fazer um inventário das rotas públicas, autenticadas e de erro.
2. Registrar para cada página: objetivo, público, CTA principal e estado atual.
3. Listar problemas visuais, funcionais, de conteúdo, SEO, acessibilidade e performance.
4. Comparar pelo menos três referências do mesmo segmento, registrando padrões úteis e decisões que não devem ser copiadas.
5. Definir os objetivos mensuráveis do lançamento, por exemplo: cadastro, criação de agenda e primeira reserva.
6. Transformar cada problema em uma tarefa com responsável, prioridade, dependências e critério de aceite.
7. Confirmar a stack, o provedor de hospedagem, o domínio e o ambiente de produção.
8. Definir a data de publicação e datas intermediárias para revisão, testes e aprovação.
9. Desenhar a estrutura final de navegação e o layout de cada página importante.
10. Fixar as decisões de tipografia, cores, imagens, espaçamento, componentes e comportamento responsivo.

## Evidências obrigatórias

- Inventário de páginas atualizado.
- Lista priorizada de tarefas.
- Referências de concorrentes e tendências.
- Data de lançamento aprovada.
- Mapa de navegação ou descrição equivalente.
- Lista de decisões de design.

## Critério de conclusão

A fase está concluída quando outra pessoa conseguir entender o que será lançado, por que será lançado, quais páginas existem, quais tarefas faltam e em que data cada etapa deve terminar.

## Registro da auditoria — 4 de outubro de 2026

### Decisões de lançamento recebidas

- **Data de publicação aprovada:** 1º de dezembro de 2026.
- **Domínio oficial aprovado:** `agendfined.com.br`.
- **Estado atual:** aplicação já está em produção; o lançamento de 1º de dezembro corresponde à divulgação pública.
- **Estado operacional confirmado:** reserva pública, consulta de reserva e cancelamento já funcionam em produção; confirmações e lembretes também estão funcionando, indicando que o fluxo cron de lembretes, a Edge Function e o Resend estão ativos.

### Escopo identificado

O lançamento avaliado é o MVP do AgendFined: uma plataforma em pt-BR para um profissional configurar um negócio, serviços e disponibilidade, compartilhar uma página pública e receber reservas. O painel privado também cobre clientes, bloqueios, lista de espera, relatórios, exportação `.ics`, autenticação em dois fatores e plano PROFISSIONAL.

### Inventário de rotas e fluxos

| Área | Rota | Objetivo, público e CTA principal | Estado observado |
| --- | --- | --- | --- |
| Aquisição | `/` | Apresentar o produto a profissionais e pequenos negócios; CTA: `Começar grátis` / `Criar minha agenda` | Implementada; landing page, recursos, planos, FAQ, sobre e footer |
| Conta | `/cadastro` | Criar a conta do negócio; CTA: enviar formulário | Implementada; coberta por teste E2E de renderização |
| Conta | `/login` | Autenticar o dono do negócio; CTA: entrar | Implementada; redireciona ao painel após autenticação |
| Conta | `/recuperar-senha` | Iniciar recuperação; CTA: solicitar e-mail | Implementada |
| Conta | `/redefinir-senha` | Definir nova senha após callback; CTA: salvar senha | Implementada; fluxo depende de configuração externa do Supabase |
| Segurança | `/mfa` | Configurar/verificar autenticação em dois fatores | Implementada; acessível a usuário autenticado |
| Onboarding | `/dashboard/setup` | Cadastrar o negócio antes de usar o painel; CTA: salvar negócio | Implementada; destino quando não há negócio |
| Operação privada | `/dashboard` | Exibir resumo e link público do negócio; CTA: ver/compartilhar página pública | Implementada; há inconsistência de domínio no texto exibido |
| Operação privada | `/dashboard/servicos` | Cadastrar e gerenciar serviços; CTA: criar/editar/desativar | Implementada |
| Operação privada | `/dashboard/agenda` | Acompanhar reservas e exportar agenda; CTA: gerenciar status/exportar `.ics` | Implementada; exportação é gated pelo plano PROFISSIONAL |
| Operação privada | `/dashboard/clientes` | Consultar clientes e histórico; CTA: pesquisar/abrir histórico | Implementada |
| Operação privada | `/dashboard/relatorios` | Acompanhar faturamento, cancelamento e no-show; CTA: selecionar período/assinar PROFISSIONAL | Implementada; recurso PROFISSIONAL |
| Operação privada | `/dashboard/lista-de-espera` | Gerenciar clientes aguardando horário; CTA: notificar/converter | Implementada; recurso PROFISSIONAL |
| Operação privada | `/dashboard/bloqueios` | Bloquear pausas, férias e exceções; CTA: adicionar bloqueio | Implementada |
| Operação privada | `/dashboard/configuracoes` | Editar negócio, disponibilidade, plano e segurança; CTA: salvar/configurar MFA | Implementada |
| Página pública | `/{slug}` | Mostrar serviços e horários do negócio ao cliente; CTA: reservar | Implementada; slug inexistente retorna 404 |
| Página pública | `/{slug}/consultar` | Consultar reserva por código público; CTA: consultar | Implementada; protegida por rate limit/Turnstile quando configurado |
| Página pública | `/{slug}/confirmacao` | Exibir confirmação, código e cancelamento; CTA: copiar/cancelar/fazer outra reserva | Implementada; dados sensíveis ficam condicionados ao código válido |
| Legal | `/privacidade` | Informar tratamento de dados e direitos | Implementada; conteúdo comercial/jurídico requer aprovação |
| Legal | `/termos` | Definir regras de uso, planos e responsabilidades | Implementada; conteúdo comercial/jurídico requer aprovação |
| Erro | `not-found` / 404 | Recuperar navegação para endereço inexistente | Implementada com CTA para início e recursos |
| Infraestrutura | `/auth/callback` | Finalizar callbacks de autenticação | Implementada e testada por unidade |
| Infraestrutura | `/api/billing/return` | Retornar do checkout de assinatura | Implementada |
| Infraestrutura | `/api/webhooks/mercadopago` | Receber e validar eventos de assinatura | Implementada; depende de credenciais e URL pública |
| Infraestrutura | `/api/internal/reconciliation` | Reconciliar assinaturas internamente | Implementada; deve permanecer privada e agendada |

Fluxo principal proposto: `landing → cadastro → setup → serviços/disponibilidade → compartilhar slug → reserva pública → confirmação por código`; fluxo de retorno: `consultar reserva → confirmação → cancelar ou fazer outra reserva`. Usuários existentes entram por `login`; o painel redireciona para `mfa` quando a política de segurança exigir.

### Stack, hospedagem e ambientes

- Next.js `16.3.3` com App Router, React `19.2.8`, TypeScript, Tailwind CSS 4 e componentes baseados em `shadcn`/Base UI.
- Supabase para autenticação, banco e RLS, usando `@supabase/ssr` e cliente server/client.
- Vitest para unidade e integração; Playwright para E2E em desktop e viewport mobile de 320px.
- Mercado Pago para assinatura PROFISSIONAL, Resend para e-mail, Cloudflare Turnstile para anti-bot e Better Stack para logs de segurança, todos dependentes de configuração externa.
- README documenta Vercel como hospedagem, `https://agendfined.com.br` como produção e Supabase como provedor de dados. O responsável confirmou Vercel, Supabase, Mercado Pago e Resend como provedores da produção; o identificador do projeto de produção está deliberadamente redigido.
- Desenvolvimento usa `http://localhost:3000`. A configuração efetiva de produção, domínio, redirect URLs do Supabase, variáveis da Vercel, webhooks, cron e certificados ainda não foi verificada neste repositório.

### Metas mensuráveis adotadas

Metas adotadas para o lançamento de 1º de dezembro de 2026:

1. Ativar pelo menos 5 negócios-piloto até a publicação.
2. Fazer pelo menos 80% dos cadastros concluírem o setup do negócio e configurarem um serviço.
3. Fazer pelo menos 50% dos negócios ativados receberem a primeira reserva em até 24 horas.
4. Manter taxa de sucesso da reserva pública acima de 95% nos smoke tests e nos primeiros 7 dias.
5. Ter zero exposição de dados entre negócios e zero segredo no bundle público ou no Git.

### Cronograma de preparação para 1º de dezembro de 2026

Marcos abaixo são derivados da data aprovada e devem ser confirmados no acompanhamento do lançamento:

- **3 de novembro (T-28):** congelar escopo, metas e conteúdo legal/comercial.
- **10 de novembro (T-21):** concluir correção de domínio e configuração inicial dos provedores.
- **17 de novembro (T-14):** concluir SEO, acessibilidade, analytics e conteúdo.
- **24 de novembro (T-7):** executar smoke tests, revisão visual desktop/mobile e teste de rollback.
- **29 de novembro (T-2):** aprovação final de produto, conteúdo, infraestrutura e suporte.
- **1º de dezembro:** publicar e iniciar monitoramento do lançamento.

### Referências de concorrentes e tendências

Pesquisa feita em 4 de outubro de 2026, usando as páginas oficiais:

- [Trinks](https://www.trinks.com/): combina descoberta de serviços, agenda online, gestão, pagamentos e prova social para beleza e bem-estar. Padrões úteis: posicionamento por segmento, depoimentos e suporte/legal visíveis. Não copiar no MVP: marketplace e escopo financeiro amplo.
- [Setmore](https://www.setmore.com/): destaca página de reservas 24/7, lembretes, pagamentos, integrações, QR Code, planos Free/Pro e suporte. Padrões úteis: explicar claramente o autoagendamento, distribuir o link em vários canais e mostrar o limite de cada plano. Não copiar no MVP: aplicativo nativo, equipe multiusuário e matriz extensa de integrações.
- [Calendly](https://calendly.com/): reduz a proposta a agendamento simples, CTA sem cartão e organização por tipo de cliente/indústria, com integrações e recursos adicionais. Padrões úteis: benefício principal acima da dobra, CTA único e redução de fricção. Não copiar no MVP: IA, notetaker e posicionamento para reuniões corporativas.

Decisão de posicionamento: lançar o núcleo simples para um negócio por profissional — página pública, disponibilidade e reserva — antes de ampliar para marketplace, equipe, pagamentos na reserva ou automações de IA.

### Problemas e riscos encontrados

- **P1 — publicação da correção:** os textos do painel, formulário e suporte foram corrigidos para o domínio oficial e o canal `agendfined@outlook.com`; é necessário publicar a versão atual antes da divulgação.
- **P1 — lançamento operacional:** a aplicação está em produção e os fluxos públicos principais foram confirmados; registrar evidências de domínio, callback de autenticação, webhook do Mercado Pago e cron de reconciliação durante as fases de segurança e publicação. O cron de lembretes já é indicado pelo funcionamento dos lembretes.
- **P1 — aprovação comercial/legal registrada:** o responsável aprovou os textos atuais de Termos e Privacidade para o lançamento; permanece recomendável revisão jurídica profissional quando houver disponibilidade.
- **P1 — contatos separados por finalidade:** `reservas@agendfined.com.br` é o remetente automático de confirmações e lembretes via Resend e já funciona em produção; `agendfined@outlook.com` é o suporte. A versão corrigida das páginas legais e do widget precisa ser publicada.
- **P1 — SEO externo pendente:** metadata, canonical, Open Graph, `sitemap.xml`, `robots.txt` e noindex foram implementados; ainda falta enviar o sitemap ao Search Console e concluir a auditoria externa.
- **P1 — métricas configuradas aguardando publicação:** o Google Analytics foi integrado sem PII, com o ID `G-92YJVL0YB0`, eventos agregados e variável de Production cadastrada na Vercel; falta publicar a versão e validar o recebimento no painel.
- **P1 — suporte operacional mínimo:** o suporte foi definido como `agendfined@outlook.com` e o widget agora abre o cliente de e-mail padrão; ainda falta confirmar posse da caixa, SLA e procedimento de atendimento.
- **P1 — QA de lançamento:** a matriz E2E desktop/mobile passou para landing, auth, legais, SEO, 404 e redirecionamentos; o fluxo de reserva E2E local continua dependente de seed/escrita no Supabase remoto.
- **P2 — conteúdo visual:** a interface usa ícones e uma prévia de produto, sem evidência de imagens comerciais, depoimentos aprovados ou materiais de marca finais.

### Tarefas priorizadas

| ID | Prioridade | Responsável | Dependências | Critério de aceite |
| --- | --- | --- | --- | --- |
| F1-001 | P0 | Produto | decisão do responsável | escopo MVP, público, metas e data de lançamento aprovados em um registro único |
| F1-002 | P0 | Engenharia | F1-001 | nenhum link exibido ao usuário usa domínio divergente; `APP_URL`, links públicos e callbacks usam a URL aprovada; testes cobrem a URL final |
| F1-003 | P0 | Infraestrutura | domínio e credenciais | Vercel, domínio, Supabase, Resend, Turnstile, Mercado Pago, webhooks e jobs estão configurados e verificados sem registrar secrets |
| F1-004 | P0 | Engenharia/QA | F1-002, F1-003 | smoke test desktop/mobile passa para cadastro, setup, reserva, confirmação, consulta, cancelamento, login e 404 |
| F1-005 | P0 | Produto/Conteúdo | revisão jurídica | Termos, Privacidade, preço do PROFISSIONAL, contato e afirmação sobre CNPJ aprovados |
| F1-006 | P1 | Engenharia/SEO | F1-001 | metadata, Open Graph, sitemap, robots e regra de noindex para privado/dados sensíveis definidos e testados |
| F1-007 | P1 | Produto/Engenharia | política de privacidade aprovada | eventos de cadastro, setup, compartilhamento e reserva definidos; analytics não coleta dados pessoais |
| F1-008 | P1 | Suporte | caixa de e-mail e SLA | endereço de suporte testado, responsável definido e resposta padrão disponível |
| F1-009 | P1 | Engenharia/QA | ambiente publicado | baseline de carregamento, erros, reserva e webhook registrado para rollback |
| F1-010 | P2 | Produto/Design | F1-001 | conteúdo final, imagens/depoimentos aprovados e revisão visual desktop/mobile concluída |

### Sequência de preparação

1. Escopo MVP, metas e data estão definidos; concluir conteúdo legal (F1-001/F1-005).
2. Corrigir e testar a URL pública e os callbacks (F1-002).
3. Configurar e verificar os serviços externos no ambiente de produção (F1-003).
4. Executar a revisão visual e os smoke tests do fluxo principal (F1-004/F1-010).
5. Executar as fases 2–5: conteúdo, SEO/acessibilidade, conversão, métricas/segurança/desempenho.
6. Fazer aprovação final, publicar e monitorar o primeiro período de operação.

### Decisões atuais de layout e design

- Landing page com navegação fixa, hero, CTA primário para cadastro, seções de como funciona, recursos, planos, sobre, FAQ e CTA final.
- Painel com navegação lateral em desktop e menu recolhível em mobile; conteúdo em cartões, tabelas/listas e estados vazios.
- Página pública de reserva centrada no negócio, serviços e horários; confirmação e consulta ficam no mesmo contexto do slug.
- Tokens visuais atuais: tema escuro monocromático, fundo `#141414`, texto claro, borda `#333333`, fonte Instrument Sans para interface e Instrument Serif para display, cantos arredondados e espaçamento responsivo Tailwind.
- Ícones Lucide e favicon são os ativos de marca identificados; não há dependência de fotos ou vídeos para o fluxo principal.
- Padrão de responsividade a validar: breakpoints Tailwind, menu de painel em 320px e formulários sem overflow horizontal.

### Evidências e pendências externas

**Evidências registradas:** inventário de rotas e fluxos, stack no `package.json`, proteção no `proxy.ts`, headers de segurança em `next.config.ts`, textos de domínio corrigidos em `app/dashboard/page.tsx` e `app/dashboard/configuracoes/business-form.tsx`, testes em `tests/e2e/` e referências oficiais acima.

**Verificações desta execução:** produção acessível em `https://agendfined.com.br`; landing, login, cadastro, privacidade, termos e 404 verificados visualmente no domínio publicado; o responsável confirmou em produção reserva pública, consulta, cancelamento, confirmações e lembretes; o projeto e o domínio foram verificados na Vercel; a aplicação AgendFined foi localizada no painel do Mercado Pago; o ID do Analytics foi cadastrado na Vercel para Production; `npm run lint` passou; `npm run typecheck` passou; `npx vitest run --project unit` passou com 42 arquivos e 299 testes; E2E local de landing, autenticação, páginas legais e redirecionamento do painel passou em desktop e mobile.

**Pendências externas:** publicar a versão atual, validar Analytics em DebugView/tempo real, enviar o sitemap ao Search Console, confirmar a caixa de suporte e os detalhes operacionais de Vercel/Supabase/Mercado Pago/Resend, concluir revisão de performance e autorizar a divulgação. O Resend e o envio de confirmações/lembretes já funcionam em produção; a data, o domínio e os textos legais foram aprovados pelo responsável.

