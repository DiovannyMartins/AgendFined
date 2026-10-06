# Prompt de finalização das fases

Copie o prompt abaixo para a IA que continuará o trabalho.

```text
Você deve finalizar a preparação de lançamento do projeto AgendFined com base na documentação existente em `docs/checklist-lancamento/`.

## Objetivo

Deixar as Fases 2, 3, 4 e 5 o mais completas possível, corrigindo falhas reais, executando as validações necessárias e registrando honestamente tudo que ainda depender de acesso ou aprovação externa.

Não invente evidências. Não marque uma tarefa como concluída apenas porque o código existe.

## Escopo excluído

Não criar, restaurar ou executar internacionalização. A fase de internacionalização foi removida do escopo e não deve voltar para a documentação, checklist ou plano de execução.

## Regras de segurança

1. Leia `AGENTS.md`, `CONTEXT.md` e os documentos das Fases 2–5 antes de agir.
2. Preserve todas as alterações existentes no repositório.
3. Não use `git reset --hard`, `git checkout --`, `git clean`, force push ou comandos destrutivos.
4. Não exponha secrets, tokens, dados de clientes, emails, telefones ou códigos de reserva.
5. Não altere DNS, Vercel, Supabase, Google Analytics, Search Console, Resend, Mercado Pago ou redes sociais sem autorização explícita.
6. Quando uma tarefa depender de credencial, URL, conta externa ou aprovação, prepare tudo que for possível e marque o item como bloqueado.
7. Não considere documentação, plano ou script como prova de que uma integração externa está ativa.
8. Faça alterações somente quando forem necessárias para concluir os itens pendentes ou corrigir erros encontrados.
9. Não adicione a internacionalização mesmo que encontre textos em português que possam ser traduzidos.

## Problemas conhecidos para verificar

- O runner E2E terminou com cenários `ok`, mas não encerrou sozinho. Investigue processos abertos, handles, servidor dev e configuração do Playwright.
- O fluxo E2E completo de reserva depende do seed remoto do Supabase e precisa ser executado com o ambiente correto ou documentado como bloqueado.
- Acessibilidade ainda não tem auditoria automatizada completa nem teste com leitor de tela.
- O Analytics está integrado, mas falta provar que um evento chegou no Google Analytics.
- PageSpeed já foi executado em produção; ainda falta corrigir os gargalos comprovados.
- Backup e retenção têm evidência externa; a restauração isolada tem registro anterior, mas não foi repetida nesta sessão.
- O monitor de disponibilidade Better Stack está ativo para a produção; alertas de 5xx e frescor do backup ainda dependem de integração adicional.
- Não existe newsletter/formulário de captação por email; o `/cadastro` usa Supabase Auth.
- O Instagram oficial foi fornecido: `https://www.instagram.com/agendfined/`.
- A posse do suporte `agendfined@outlook.com` foi confirmada; responsável e SLA estão fora do escopo.

## Fase 2 — Qualidade visual e conteúdo

1. Audite `public/images/hero.png` e `public/images/hero.webp` e todas as imagens usadas.
2. Verifique dimensões, peso, formato, carregamento, `priority`, `sizes`, `alt` e fallback.
3. Meça o impacto do vídeo HLS e confirme que o site continua utilizável com vídeo bloqueado ou `prefers-reduced-motion`.
4. Execute uma varredura de links internos e externos; não valide somente os links cobertos por testes existentes.
5. Teste cadastro, login, recuperação de senha, setup, serviços, configurações, reserva pública, consulta, confirmação e cancelamento.
6. Quando o teste de reserva precisar do Supabase remoto, configure o ambiente conforme `AGENTS.md` e use Node 22+. Se não for possível, registre o bloqueio com a causa exata.
7. Verifique todos os textos em busca de placeholders, erros, domínio antigo, email antigo ou promessa não aprovada.
8. Confira o logo, favicon, copyright, telefone, email de suporte, Termos e Privacidade.
9. Faça revisão em desktop e viewport mobile de 320px, procurando overflow horizontal, elementos cortados, foco invisível e botões inacessíveis.
10. Corrija somente os problemas comprovados.

## Fase 3 — SEO e acessibilidade

1. Execute os testes de `robots.txt`, `sitemap.xml`, canonical, metadata, Open Graph e `noindex`.
2. Confirme que páginas privadas, consulta, confirmação e dados de reserva não são indexáveis.
3. Verifique se o sitemap é válido mesmo quando o Supabase está indisponível.
4. Execute uma auditoria automatizada de acessibilidade usando uma ferramenta compatível com o projeto.
5. Corrija problemas críticos e sérios encontrados.
6. Teste navegação completa por teclado: skip link, menu, links, formulários, diálogos, botões e mensagens de erro.
7. Valide contraste e foco visível.
8. Teste pelo menos uma página pública e uma página autenticada com leitor de tela, se a ferramenta estiver disponível.
9. Não crie links sociais falsos. Se as URLs não forem fornecidas, mantenha o item bloqueado.
10. Não acesse ou altere o Search Console sem autorização. Deixe instruções exatas para enviar o sitemap.

## Fase 4 — Conversão e comunicação

1. Não invente um provedor de email nem armazene contatos sem consentimento e decisão de produto.
2. Se houver credenciais e autorização, implemente o formulário com consentimento, confirmação, descadastro, validação e proteção contra abuso.
3. Se não houver credenciais, prepare o contrato da integração e marque o item como bloqueado.
4. Não adicione redes sociais sem URLs oficiais fornecidas pelo responsável.
5. Verifique se o widget de suporte abre o endereço correto e registre que ele é suporte por email, não chat ao vivo.
6. Registre `agendfined@outlook.com` como suporte; não crie responsável ou SLA quando estiverem fora do escopo.
7. Prepare textos e calendário de divulgação, mas não publique campanhas sem autorização.
8. Não crie lista de contatos fictícia ou dados de teste em produção.

## Fase 5 — Métricas, segurança e desempenho

1. Execute `npm run lint`, `npm run typecheck`, `npx vitest run --project unit` e `npm run build`.
2. Execute os E2E afetados e investigue qualquer processo que permaneça aberto após o resumo.
3. Rode `npm run check:launch -- --production` com Node 22+ e registre o resultado sem expor secrets.
4. Confirme que a CSP permite somente os hosts necessários para Analytics, Turnstile, Supabase e vídeo.
5. Confirme que Analytics não envia PII e que eventos usam nomes e parâmetros esperados.
6. Se houver acesso autorizado ao Google Analytics, valide pelo menos um evento em DebugView ou tempo real. Caso contrário, registre o bloqueio.
7. Execute Lighthouse/PageSpeed para home, login e uma página pública. Registre LCP, CLS, performance, acessibilidade, SEO e boas práticas.
8. Corrija apenas gargalos comprovados e repita a medição.
9. Verifique HTTPS, certificado, HSTS, headers, cookies, CSP, `X-Frame-Options` e ausência de secrets no bundle.
10. Não declare backup concluído apenas porque existem scripts. Confirme backup, retenção e restauração em ambiente isolado, ou marque como bloqueado.
11. Não declare monitoramento concluído apenas porque existe um runbook. Confirme alertas ativos ou registre o provedor e a configuração que ainda falta.
12. Atualize o runbook com comandos reais, responsáveis, limites, rollback e contatos somente quando essas informações forem confirmadas.

## Validação final obrigatória

Antes de concluir:

1. Rode `git diff --check`.
2. Rode todos os testes aplicáveis sem deixar processos pendurados.
3. Revise o diff inteiro procurando regressões, domínio antigo, links quebrados, PII e secrets.
4. Confira que nenhum arquivo ou referência de internacionalização foi reintroduzido.
5. Confirme que o build gera as rotas esperadas.
6. Não marque fase como concluída se existir uma pendência que bloqueia seu critério de conclusão.

## Relatório obrigatório

Atualize os arquivos das Fases 2–5 com status honesto:

- `[x]` concluído e comprovado;
- `[~]` parcialmente concluído;
- `[!]` bloqueado por acesso, credencial ou aprovação;
- `[ ]` não iniciado.

Depois entregue:

### Resumo

- Fase 2: concluída, parcial ou bloqueada
- Fase 3: concluída, parcial ou bloqueada
- Fase 4: concluída, parcial ou bloqueada
- Fase 5: concluída, parcial ou bloqueada

### Alterações realizadas

- arquivo absoluto
- mudança realizada
- motivo

### Verificações

- comando
- resultado
- duração ou observação relevante

### Pendências externas

- conta ou acesso necessário
- ação manual exata
- responsável
- evidência esperada

### Riscos encontrados

- erro
- impacto
- prioridade
- recomendação

Não diga que o projeto está 100% pronto se qualquer item essencial ainda estiver bloqueado. Explique exatamente o que falta para chegar a 100%.
```

