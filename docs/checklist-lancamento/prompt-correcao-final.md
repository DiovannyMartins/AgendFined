# Prompt para correção final do checklist de lançamento

Você está trabalhando no repositório `D:\projeto`, aplicação AgendFined.

Sua missão é corrigir os problemas técnicos e documentais encontrados na revisão final, concluir tudo que puder com segurança e apresentar evidências verificáveis. Não declare que o projeto está 100% concluído enquanto existir erro reproduzível, item sem evidência ou dependência externa pendente.

## Objetivo

Levar as fases 1 a 5 do checklist de lançamento ao estado mais próximo possível de 100%, corrigindo código, testes, automações e documentação. O resultado precisa ser tecnicamente confiável, reproduzível e coerente com o checklist original de 50 itens da Wix.

O item 49, internacionalização/site multilíngue, está explicitamente fora do escopo por decisão do responsável. Não recrie `06-internacionalizacao.md`, não implemente tradução e não trate essa exclusão como pendência.

## Regras obrigatórias antes de começar

1. Leia integralmente:
   - `AGENTS.md`;
   - `CONTEXT.md`;
   - todos os arquivos em `docs/checklist-lancamento/`;
   - os ADRs relevantes em `docs/adr/`;
   - `package.json`;
   - a documentação relevante do Next.js 16 em `node_modules/next/dist/docs/` antes de alterar código Next.js.
2. Execute `git status --short` e preserve todas as alterações existentes do usuário.
3. Não use `git reset --hard`, `git checkout --`, `git clean`, exclusões recursivas ou qualquer comando destrutivo.
4. Não exponha secrets, tokens, chaves, cookies, dados pessoais, códigos de reserva ou conteúdo de arquivos `.env`.
5. Não altere DNS, Vercel, Supabase de produção, Google Analytics, Search Console, Resend, Mercado Pago, Better Stack ou redes sociais sem autorização explícita.
6. Os testes de integração usam um Supabase real. Não os execute até confirmar que possuem isolamento e limpeza segura. Nunca faça teste destrutivo contra produção.
7. Faça mudanças pequenas e rastreáveis. Depois de cada grupo, execute as validações relevantes.
8. Não transforme uma dependência externa em `[x]` apenas porque o código está preparado. Use `[!]` ou `[~]` e descreva exatamente o que falta.

## Estado conhecido da revisão

Considere estes achados como ponto de partida, mas confirme cada um no código antes de alterar:

1. `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build` passaram.
2. O build gerou 26 páginas sem erro.
3. O Playwright travou antes de listar os cenários e deixou seis processos Node órfãos.
4. `tests/e2e/booking.spec.ts` cria usuário e dados no Supabase remoto, mas não possui limpeza em `afterAll`.
5. `.github/workflows/backup-restore-drill.yml` consulta `auth.users`, mas não falha quando a quantidade restaurada de usuários é zero.
6. A Fase 4 diz que não há formulário de captação, mas a home possui `InterestForm`, uma server action e envio de e-mails via Resend.
7. O item 34 está marcado como chat ao vivo concluído, embora o site ofereça suporte assíncrono por e-mail.
8. Os itens 29, feedback de outra pessoa, e 42, teste de usabilidade, não aparecem nos documentos das fases.
9. O item 49 foi removido propositalmente e deve continuar fora do escopo.
10. O Google Analytics carrega a tag, mas ainda não há confirmação de hit real no DebugView ou tempo real.
11. O LCP mobile registrado é aproximadamente 4,4 s, acima do limite interno de 2,5 s.
12. A auditoria completa de acessibilidade e o teste com leitor de tela ainda não foram concluídos.
13. O sitemap foi reenviado ao Search Console em 6 de outubro de 2026, mas o processamento ainda estava pendente.
14. A divulgação e as campanhas ainda dependem de aprovação externa.
15. Alguns documentos apresentam informações antigas que contradizem as evidências mais recentes.

## Ordem de execução

Trabalhe na ordem abaixo. Não pule diretamente para documentação antes de corrigir e validar o comportamento.

### Etapa 1 — Corrigir a segurança e o isolamento do E2E de reserva

Revise `tests/e2e/booking.spec.ts` e todos os auxiliares relacionados.

Implemente uma estratégia de limpeza garantida:

1. Registre os IDs de todos os dados criados pelo teste.
2. Adicione `test.afterAll` com `try/finally` ou mecanismo equivalente.
3. Remova os dados na ordem correta para respeitar as foreign keys.
4. Remova o usuário de autenticação criado pelo teste.
5. Faça a limpeza funcionar mesmo quando um teste falhar no meio do fluxo.
6. Use identificadores exclusivos por execução.
7. Não remova registros que não foram criados pelo teste.
8. Não execute a limpeza se as variáveis obrigatórias estiverem ausentes ou apontarem para um ambiente não autorizado.
9. Adicione uma proteção explícita contra execução acidental em produção. Prefira uma variável inequívoca, como `ALLOW_REMOTE_E2E_WRITES=true`, combinada com validação do host/projeto permitido.
10. Se já existir convenção de isolamento nos testes de integração, reutilize-a.

Melhore também a robustez do setup:

- verifique erros retornados por `createUser`, `upsert`, `insert` e `select`;
- falhe com mensagens claras se o seed não puder ser criado;
- evite non-null assertions em dados remotos sem validação;
- não use dados pessoais reais;
- verifique se o cálculo de “amanhã” é estável no fuso horário adotado pelo projeto.

Critérios de aceite:

- uma execução bem-sucedida não deixa usuário, negócio, serviços, disponibilidade ou reservas residuais;
- uma execução interrompida/falha tenta realizar a mesma limpeza;
- o teste se recusa a escrever quando a autorização explícita não existe;
- a estratégia está documentada sem expor credenciais.

### Etapa 2 — Corrigir o travamento do Playwright

Investigue por que o comando abaixo não inicia ou não encerra corretamente:

```pwsh
npx playwright test tests/e2e/landing.spec.ts tests/e2e/seo.spec.ts tests/e2e/public.spec.ts --project=chromium --workers=1
```

Verifique, no mínimo:

- `playwright.config.ts`;
- ciclo de vida de `webServer`;
- comportamento de `npm run dev` e do Next.js 16 no Windows;
- uso de `reuseExistingServer`;
- servidores antigos ocupando a porta 3000;
- processos filhos iniciados pelo npm;
- handles abertos por Playwright, Next.js, HLS, Supabase ou instrumentação;
- diferença entre `next dev` e testar um build com `next start`;
- comportamento com `CI=1`;
- timeouts e reporter;
- processos Node restantes depois do teste.

Não aplique uma solução baseada apenas em matar todos os processos Node da máquina. O runner deve encerrar somente os processos que ele próprio iniciou.

Adicione ou ajuste scripts/configuração apenas se houver causa demonstrada. Prefira uma configuração reprodutível, por exemplo preparar o build e iniciar `next start` para E2E, se isso for compatível com o projeto e comprovadamente resolver o problema.

Critérios de aceite:

- o conjunto E2E seguro inicia, lista os testes, termina sozinho e devolve exit code correto;
- não deixa processos Node, servidor ou porta ocupada;
- funciona em duas execuções consecutivas;
- erros reais provocam exit code diferente de zero;
- o procedimento funciona no Windows e está adequado para CI.

### Etapa 3 — Fortalecer o drill de restauração

Revise `.github/workflows/backup-restore-drill.yml`.

Depois de extrair as contagens, adicione uma asserção para exigir pelo menos um usuário restaurado em `auth.users`, da mesma forma que já ocorre com businesses, bookings e customers.

Também verifique:

- se falhas na descriptografia interrompem o job;
- se ambos os dumps realmente são encontrados;
- se as variáveis extraídas não ficam vazias;
- se a restauração usa apenas banco descartável;
- se a etapa de parada executa com `if: always()`;
- se as verificações de RLS e foreign keys falham corretamente;
- se a origem do artefato está limitada a uma execução confiável do workflow esperado;
- se nenhuma chave ou dado sensível aparece nos logs.

Se possível, crie uma pequena validação local ou teste estático para impedir a remoção futura da asserção de `auth.users`.

Critérios de aceite:

- o workflow falha se `auth.users = 0`;
- o workflow continua validando dados, RLS e foreign keys;
- a documentação não afirma mais do que o workflow comprova.

### Etapa 4 — Corrigir a Fase 4 e decidir o papel do formulário de interesse

Analise em conjunto:

- `app/(marketing)/page.tsx`;
- `components/marketing/interest-form.tsx`;
- `lib/marketing/actions.ts`;
- `lib/email/interest.ts`;
- política de privacidade;
- termos de uso;
- `docs/checklist-lancamento/04-conversao-e-comunicacao.md`.

O formulário existe e envia uma notificação ao suporte e uma confirmação ao visitante. Portanto, não escreva que não existe captação.

Determine e documente corretamente uma destas situações:

1. Formulário de interesse individual, sem newsletter recorrente; ou
2. Inscrição em lista de marketing/newsletter.

Não transforme silenciosamente o formulário em newsletter. Se o produto não possui lista persistente, gestão de consentimento e cancelamento de inscrição, descreva-o como formulário de interesse, não como newsletter.

Verifique:

- consentimento explícito;
- finalidade informada ao usuário;
- política de privacidade compatível;
- ausência de armazenamento desnecessário;
- mensagens de sucesso e erro;
- tratamento de indisponibilidade do Resend;
- proteção anti-bot e rate limit;
- acessibilidade do formulário;
- testes unitários da server action e do envio de e-mail;
- se o texto “enviamos uma confirmação” corresponde ao comportamento real;
- se existe necessidade de registrar contato ou se o e-mail ao suporte é a evidência operacional escolhida.

Corrija os itens 19 e 38 com status e justificativa honestos.

Para o item 34, não chame e-mail de “chat ao vivo”. Registre uma destas opções:

- `[x]` substituição por suporte assíncrono aprovada pelo responsável, com canal, responsável e expectativa de resposta documentados;
- `[~]` suporte por e-mail implementado, mas sem chat ao vivo/SLA;
- `[!]` chat ao vivo depende de decisão ou ferramenta externa.

### Etapa 5 — Reintroduzir os itens 29 e 42 no plano

O checklist original possui:

- item 29: obter feedback de outra pessoa;
- item 42: realizar teste de usabilidade.

Inclua esses itens na fase mais adequada sem confundi-los com testes automatizados. Teste E2E não substitui feedback humano nem teste de usabilidade.

Crie um roteiro curto e executável contendo:

- perfil dos participantes;
- tarefas a realizar;
- versão e ambiente testados;
- critérios de sucesso;
- perguntas após a tarefa;
- registro de dificuldade, erro e observação;
- severidade dos problemas encontrados;
- decisão sobre correção antes ou depois do lançamento;
- responsável e data.

Se nenhum teste humano tiver sido realizado, marque `[!]` ou `[ ]`. Não invente participantes, respostas ou resultados.

### Etapa 6 — Concluir acessibilidade

Faça uma auditoria proporcional ao escopo público e autenticado.

Verifique:

- navegação completa por teclado;
- ordem de foco;
- foco visível;
- skip link;
- headings e landmarks;
- nomes acessíveis de controles;
- labels e descrições de erros;
- diálogos e retorno de foco;
- contraste;
- zoom em 200%;
- viewport de 320 px sem rolagem horizontal indevida;
- `prefers-reduced-motion`;
- textos alternativos;
- conteúdo dinâmico e anúncios por leitor de tela;
- formulários de login, cadastro, recuperação, interesse, configuração e reserva.

Execute uma ferramenta automatizada apropriada, como axe, além dos testes manuais. Adicione testes automatizados apenas onde reduzirem regressão real. Registre resultados e limitações.

O item 32 somente pode virar `[x]` depois de auditoria automatizada e verificação manual documentadas. Se o leitor de tela não puder ser testado, mantenha parcial.

### Etapa 7 — Analytics

Revise a integração sem enviar dados pessoais.

Confirme:

- carregamento condicionado a `NEXT_PUBLIC_GA_MEASUREMENT_ID` válido;
- CSP compatível com os endpoints realmente usados;
- nenhuma duplicação de `page_view`;
- eventos `sign_up`, `login`, `business_created` e `booking_complete`;
- nenhum e-mail, telefone, nome, código de reserva ou ID pessoal nos parâmetros;
- comportamento quando bloqueadores de anúncios impedem o carregamento;
- ausência de erros no console;
- respeito às decisões de privacidade aplicáveis.

Crie testes unitários para a fila `dataLayer` e o envio por `gtag`, se ainda não existirem.

A confirmação de hit no DebugView/tempo real é uma ação externa. Se não houver acesso autorizado, mantenha o item 45 bloqueado e forneça passos exatos para o responsável validar. Não falsifique evidência.

### Etapa 8 — Desempenho

Use as medições existentes como baseline:

- desempenho mobile: 76;
- LCP: aproximadamente 4,4 s;
- FCP: aproximadamente 2,7 s;
- TBT: aproximadamente 240 ms;
- CLS: aproximadamente 0,037;
- aproximadamente 298 KiB de JavaScript não usado;
- cinco tarefas longas.

Investigue com evidência antes de alterar:

- vídeo HLS da hero;
- importação e inicialização de `hls.js`;
- momento em que o vídeo é carregado;
- prioridade e tamanho da imagem da hero;
- fontes;
- JavaScript de componentes client acima da dobra;
- `motion` e outras bibliotecas pesadas;
- terceiros como Turnstile e Google Analytics;
- hidratação desnecessária;
- cache e headers de assets.

Não remova funcionalidades essenciais apenas para melhorar pontuação. Preserve `prefers-reduced-motion` e fallback quando o vídeo falhar.

Repita a medição em produção somente se houver autorização e deploy disponível. Registre URL, data, dispositivo, ferramenta, métricas antes/depois e relatório. O item de desempenho só pode ser concluído quando atingir o limite aprovado ou quando o responsável aprovar formalmente outro limite.

### Etapa 9 — Search Console e SEO

Confirme no código:

- metadata;
- canonical;
- Open Graph;
- Twitter cards;
- `robots.txt`;
- `sitemap.xml`;
- noindex em rotas privadas;
- status HTTP das páginas públicas;
- ausência de rotas privadas no sitemap.

Não altere o Search Console sem autorização. Como o sitemap já foi reenviado em 6 de outubro de 2026, atualize a documentação para distinguir:

- sitemap enviado;
- sitemap processado;
- páginas indexadas.

O item 44 pode ficar parcial enquanto o Google processa a leitura; não deve continuar descrito como “não enviado” se já foi reenviado.

### Etapa 10 — Divulgação, manutenção e responsabilidades

Para os itens 39 e 47, prepare materiais e checklist, mas não publique campanhas sem autorização.

Para o item 50, documente:

- responsável principal e substituto, quando informados;
- periodicidade das verificações;
- canal de alerta;
- SLA ou expectativa de resposta;
- calendário de atualização de dependências, conteúdo, segurança e acessibilidade;
- procedimento de incidente e rollback.

Se responsável ou SLA não forem informados, mantenha o item parcial. Não invente nomes ou compromissos.

### Etapa 11 — Consolidar a documentação

Revise todos os arquivos em `docs/checklist-lancamento/` e remova contradições.

Regras:

1. Cada item de 1 a 50 deve aparecer exatamente uma vez, exceto o item 49, excluído por decisão do responsável.
2. O item 22 não deve ficar duplicado em duas fases.
3. Os itens 29 e 42 devem aparecer com status real.
4. Não recrie documentação de internacionalização.
5. Use:
   - `[x]` concluído e comprovado;
   - `[~]` parcialmente concluído;
   - `[!]` bloqueado por acesso, decisão ou dependência externa;
   - `[ ]` não iniciado.
6. Toda marcação `[x]` precisa apontar para evidência concreta.
7. Datas, métricas e resultados devem ser coerentes entre as fases.
8. Remova afirmações antigas, como “falta medir performance”, quando já existe medição registrada.
9. Diferencie implementação técnica, validação local, validação em produção e aprovação humana.
10. Atualize o README com um resumo único da situação.

Crie uma verificação simples para detectar automaticamente:

- números ausentes;
- números duplicados;
- presença indevida do item 49;
- status inválido;
- link para arquivo inexistente.

## Validação técnica obrigatória

Use Node 22 conforme `AGENTS.md`.

Execute, registre o exit code e resuma a saída:

```pwsh
npm run lint
npm run typecheck
npx vitest run --project unit
npm run build
git diff --check
git status --short
```

Depois de corrigir o runner, execute duas vezes o conjunto E2E sem escrita remota:

```pwsh
npx playwright test tests/e2e/landing.spec.ts tests/e2e/seo.spec.ts tests/e2e/public.spec.ts --project=chromium --workers=1
npx playwright test tests/e2e/landing.spec.ts tests/e2e/seo.spec.ts tests/e2e/public.spec.ts --project=chromium --workers=1
```

Após cada execução, confirme que não restou servidor do teste, processo Node órfão ou porta ocupada.

Somente execute o E2E de reserva e os testes de integração quando:

- o ambiente remoto estiver explicitamente autorizado;
- a proteção contra produção estiver ativa;
- a limpeza estiver implementada e revisada;
- as credenciais necessárias estiverem disponíveis sem serem exibidas.

Quando autorizado, use Node 22 e siga exatamente o comando de integração definido em `AGENTS.md`.

Execute `npm run check:launch -- --production` somente em ambiente com acesso de rede. Se falhar com `fetch failed`, diferencie restrição do ambiente de indisponibilidade real do site. Não declare produção fora do ar sem confirmação independente.

## Resultado final obrigatório

Ao terminar, entregue um relatório com esta estrutura:

### 1. Resumo executivo

- percentual real concluído;
- fases concluídas, parciais e bloqueadas;
- declaração explícita se está ou não 100% pronto.

### 2. Correções realizadas

Para cada correção:

- problema original;
- arquivos alterados;
- solução aplicada;
- risco reduzido;
- evidência ou teste.

### 3. Resultado dos 49 itens em escopo

Liste uma linha por item, de 1 a 48 e o item 50. Para cada um, informe status e evidência. Registre separadamente que o item 49 foi excluído por decisão do responsável.

### 4. Testes e comandos

Informe comando, resultado, exit code, duração aproximada e observações. Não escreva “passou” se o processo travou ou precisou ser encerrado manualmente.

### 5. Pendências externas

Para cada pendência:

- ação necessária;
- plataforma;
- responsável esperado;
- acesso necessário;
- critério para considerar concluída.

### 6. Riscos restantes

Liste severidade, impacto, probabilidade e mitigação.

### 7. Veredito

Use apenas uma destas frases:

- `100% concluído e comprovado` — somente se todos os 49 itens em escopo estiverem concluídos e validados;
- `tecnicamente pronto, com ações externas pendentes`;
- `parcialmente concluído`;
- `não pronto para lançamento`.

Nunca use a primeira opção se Analytics, acessibilidade, desempenho, E2E, Search Console, feedback humano, usabilidade ou aprovações obrigatórias continuarem sem evidência.

