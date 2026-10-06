# Prompt para IA executora

Copie o texto abaixo e forneça-o à IA que fará a execução.

```text
Você é uma IA responsável por preparar este projeto para o lançamento de um site.

## Contexto

O repositório é o AgendFined, uma aplicação Next.js 16 com React, TypeScript, Tailwind, Supabase, autenticação, dashboard e página pública de reservas.

Existe uma documentação de planejamento em:

- docs/checklist-lancamento/README.md
- docs/checklist-lancamento/01-auditoria-e-planejamento.md
- docs/checklist-lancamento/02-qualidade-visual-e-conteudo.md
- docs/checklist-lancamento/03-seo-e-acessibilidade.md
- docs/checklist-lancamento/04-conversao-e-comunicacao.md
- docs/checklist-lancamento/05-metricas-seguranca-e-desempenho.md
- docs/checklist-lancamento/06-internacionalizacao.md

Use esses arquivos como plano de execução. Não invente requisitos fora do escopo sem avisar.

## Regras obrigatórias

1. Leia primeiro `AGENTS.md`, `CONTEXT.md`, os arquivos relevantes em `docs/agents/` e a documentação aplicável do Next.js em `node_modules/next/dist/docs/`.
2. Antes de editar, inspecione o estado do Git e preserve todas as alterações existentes.
3. Não use `git reset --hard`, `git checkout --`, `git clean`, force push ou qualquer comando destrutivo.
4. Não reverta alterações feitas por outra pessoa.
5. Faça alterações pequenas, justificadas e compatíveis com os padrões já existentes.
6. Não crie tabelas, migrações ou integrações externas sem justificar a necessidade.
7. Nunca exponha secrets, tokens, chaves privadas ou dados pessoais em código, logs ou documentação.
8. Não publique, compre domínio, altere DNS, envie campanhas, crie contas ou modifique serviços externos sem aprovação explícita do usuário.
9. Quando uma etapa depender de credenciais, URL, ID de analytics, provedor ou decisão de produto, pare a etapa e registre a pendência.
10. Use português do Brasil na interface e na documentação do projeto.

## Método de trabalho

Execute uma fase por vez, na ordem indicada.

Para cada fase:

1. Leia o arquivo Markdown da fase.
2. Inspecione o código relacionado.
3. Liste o que já está feito, o que está parcial e o que falta.
4. Implemente somente o que for possível dentro do repositório.
5. Para cada item externo, prepare a configuração ou instrução necessária, mas não execute a ação externa sem autorização.
6. Adicione ou atualize testes quando fizer sentido.
7. Execute as verificações adequadas:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run test:e2e`, quando a alteração afetar o fluxo visual ou público
8. Faça uma revisão visual quando houver alteração de interface.
9. Atualize os checkboxes da documentação somente com base em evidências.
10. Ao terminar a fase, apresente um relatório antes de iniciar a próxima.

## Fases

### Fase 1 — Auditoria e planejamento

- Inventarie as rotas, páginas, componentes e fluxos principais.
- Identifique pendências de conteúdo, UX, SEO, acessibilidade, segurança e performance.
- Confirme a tecnologia, hospedagem, domínio e ambientes.
- Crie uma lista priorizada de tarefas com critérios de aceite.
- Não marque como concluída nenhuma etapa apenas porque existe uma intenção documentada.

### Fase 2 — Qualidade visual e conteúdo

- Revise imagens, vídeos, logo, favicon, copyright e textos.
- Remova placeholders e corrija erros de conteúdo.
- Confirme CTAs, formulários, links, navegação, página 404 e informações de contato.
- Teste as páginas em desktop e mobile.
- Corrija problemas encontrados sem alterar fluxos de negócio sem justificativa.

### Fase 3 — SEO e acessibilidade

- Revise metadata, títulos, descrições, headings, URLs e Open Graph.
- Crie ou ajuste `sitemap.xml` e `robots.txt` quando apropriado.
- Impeça a indexação de páginas privadas e dados sensíveis.
- Faça testes manuais de teclado, foco, contraste, labels e mensagens de erro.
- Execute auditoria automatizada quando houver ferramenta disponível.
- Não envie o site ao Search Console sem aprovação e credenciais do usuário.

### Fase 4 — Conversão e comunicação

- Prepare formulário de inscrição por email, estados de sucesso e erro.
- Não conecte um provedor de email sem credenciais e aprovação.
- Prepare links sociais somente quando o usuário fornecer as URLs oficiais.
- Prepare suporte, chat, lista de contatos e materiais de divulgação.
- Não publique posts, envie emails ou altere contas externas sem autorização explícita.

### Fase 5 — Métricas, segurança e desempenho

- Meça desempenho local e, quando houver URL, produção.
- Prepare integração de analytics sem enviar dados pessoais.
- Revise HTTPS, SSL, headers, CSP, cookies, autenticação e secrets.
- Confirme backup e restauração sem expor dados.
- Prepare monitoramento, limites de alerta, rollback e plano de manutenção.
- Não altere DNS, Vercel, Supabase ou Google Analytics sem autorização.

### Fase 6 — Internacionalização

- Pergunte quais idiomas e países serão atendidos se essa informação não existir.
- Separe textos traduzíveis da lógica.
- Proponha a estratégia de rotas e SEO internacional.
- Não traduza textos legais ou conteúdo comercial sem aprovação.
- Teste formatos de data, hora, moeda, números, emails e páginas de erro.

## Formato obrigatório do relatório de cada fase

Use este formato:

### Fase: [nome]

**Status:** concluída, parcial ou bloqueada

**Itens concluídos:**
- [número] — [descrição]

**Itens parciais:**
- [número] — [o que foi feito e o que falta]

**Itens bloqueados:**
- [número] — [dependência e ação necessária do usuário]

**Arquivos alterados:**
- [caminho absoluto]

**Verificações executadas:**
- [comando] — passou ou falhou

**Pendências e riscos:**
- [item]

**Aprovação necessária:**
- Explique claramente o que precisa ser decidido antes de continuar.

Não avance para uma ação externa ou para uma decisão de produto sem aprovação do usuário.

## Resultado final esperado

Ao terminar todas as fases, entregue:

1. A aplicação revisada e testada.
2. A checklist dos 50 itens com status baseado em evidências.
3. Relatório de arquivos alterados.
4. Relatório de testes e verificações.
5. Lista de pendências externas.
6. Instruções manuais para domínio, analytics, Search Console, email, redes sociais e publicação.
7. Riscos conhecidos e recomendações de manutenção.
```

