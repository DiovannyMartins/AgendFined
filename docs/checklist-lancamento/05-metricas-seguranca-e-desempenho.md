# Fase 5 — Métricas, segurança e desempenho

## Objetivo

Medir o comportamento do site, proteger os dados e confirmar que a aplicação suporta o lançamento com desempenho aceitável.

**Status da fase:** parcial — aplicação, domínio, SSL, sitemap, logs, backup e alertas operacionais têm evidência; o Analytics ainda não confirmou um hit no DebugView/tempo real e o LCP mobile continua acima do limite.

## Itens relacionados

- [~] 2. Verificar velocidade do site antes do lançamento — PageSpeed foi repetido em produção; o LCP mobile caiu de aproximadamente 13,6 s para 6,5 s, mas ainda está acima do limite de 2,5 s.
- [x] 15. Integrar web analytics
- [x] 16. Confirmar domínio
- [x] 23. Conectar ou transferir domínio
- [x] 40. Publicar o site
- [~] 41. Fazer backup — workflow manual concluído com artefato e retenção de 30 dias; restauração isolada tem evidência registrada anteriormente e a verificação criptográfica foi repetida nesta execução.
- [x] 43. Verificar SSL
- [!] 45. Verificar análises — Tag Assistant encontrou `G-92YJVL0YB0`, mas a sessão mostrou que nenhum hit foi enviado.
- [~] 46. Testar velocidade em produção — PageSpeed mobile: desempenho 67, acessibilidade 96, boas práticas 92, SEO 100, CLS 0,037, LCP 6,5 s.
- [x] 48. Criar monitoramento de desempenho — monitor de disponibilidade, alerta 5xx e heartbeat de backup ativo no Better Stack.
- [~] 50. Criar plano de manutenção — runbook local registrado; o SLA de suporte está fora do escopo.

## Instruções de desempenho

1. Medir páginas principais com Lighthouse e PageSpeed Insights.
2. Registrar métricas de carregamento, acessibilidade, SEO e boas práticas.
3. Corrigir imagens pesadas, JavaScript desnecessário, fontes e bloqueios de renderização.
4. Repetir a medição em desktop e mobile depois das correções.
5. Definir limites aceitáveis e uma rotina de medição após o lançamento.

## Instruções de analytics

1. Criar ou selecionar a propriedade do Google Analytics.
2. Adicionar o ID somente por variável de ambiente pública apropriada.
3. Medir visualização, cadastro, login, criação de negócio e reserva concluída.
4. Não enviar dados pessoais, emails, telefones ou códigos de reserva.
5. Validar os eventos no modo de depuração.
6. Confirmar os dados no painel depois da publicação.

### Implementação registrada

- ID informado pelo responsável: `G-92YJVL0YB0`.
- O carregamento está condicionado a `NEXT_PUBLIC_GA_MEASUREMENT_ID` e usa `afterInteractive`.
- A CSP foi ajustada para permitir o Google Tag e os endpoints de coleta.
- Eventos agregados implementados: `sign_up`, `login`, `business_created` e `booking_complete`.
- Nenhum evento envia e-mail, telefone, nome, código de reserva ou identificador de usuário.
- A variável `NEXT_PUBLIC_GA_MEASUREMENT_ID` foi cadastrada na Vercel para Production.
- O código está publicado em produção e o carregamento do Google Analytics foi validado no HTML/CSP do domínio oficial.
- O Tag Assistant encontrou a tag `G-92YJVL0YB0`, mas exibiu “Esta tag não enviou nenhum hit”; a confirmação de evento permanece bloqueada até o Google Analytics receber um hit.

## Instruções de domínio e segurança

1. Confirmar propriedade do domínio e registros DNS.
2. Configurar domínio na hospedagem e no Supabase.
3. Redirecionar HTTP para HTTPS.
4. Verificar certificado, validade, cadeia e ausência de alertas no navegador.
5. Revisar CSP, HSTS, cookies, headers, autenticação e exposição de secrets.

## Instruções de backup e manutenção

1. Confirmar backup automático do banco e retenção.
2. Testar restauração em ambiente separado.
3. Definir responsáveis e periodicidade de atualização.
4. Monitorar erros, disponibilidade, backup, tempo de resposta e eventos críticos.
5. Criar calendário para dependências, conteúdo, segurança, domínio e revisão de acessibilidade.
6. Registrar procedimento de rollback e contatos de emergência.

## Evidências obrigatórias

- Relatórios PageSpeed/Lighthouse antes e depois.
- Eventos do Analytics recebidos.
- DNS e domínio verificados.
- SSL confirmado.
- Backup restaurado em ambiente isolado.
- Monitoramento ativo.
- Calendário de manutenção aprovado.

## Evidências desta execução

- `agendfined.com.br` acessível em HTTPS e domínio associado ao projeto `agendfined` na Vercel.
- Aplicação AgendFined visível no painel de integrações do Mercado Pago.
- ID do Analytics cadastrado na Vercel como configuração de Production.
- `npm run lint`, `npm run typecheck` e `npx vitest run --project unit` aprovados; 42 arquivos e 299 testes unitários passaram.
- `npm run build` aprovado com Next.js 16.3.3; as 26 páginas foram geradas sem erro.
- Runbook de operação, backup, rollback e manutenção registrado em `docs/checklist-lancamento/operacao-pos-lancamento.md`.
- `npm run check:launch -- --production` confirmou as variáveis configuradas, mas não alcançou `/`, `/robots.txt` ou `/sitemap.xml` por falha de rede; o segredo do scheduler de reconciliação também permanece ausente.
- PageSpeed foi repetido em produção após a última otimização: desempenho mobile 67, LCP 6,5 s, CLS 0,037, acessibilidade 96, boas práticas 92 e SEO 100. O relatório apontou 352 KiB de JavaScript não usado e 3 tarefas longas.
- O sitemap `https://agendfined.com.br/sitemap.xml` respondeu HTTP 200 com XML válido e foi reenviado no Search Console em 6 de outubro de 2026; o Google ainda está processando a leitura.
- O workflow manual de backup #42 concluiu com sucesso no GitHub Actions em 38 s, publicou um artefato e renovou o heartbeat. O Better Stack mostra `AgendFined backup freshness` como `Up`, esperado a cada 18 horas, com último heartbeat recente.
- O alerta de erros 5xx foi salvo no Better Stack para a fonte `AgendFined Vercel`, usando consulta Log SQL, limiar acima de zero, janela de 5 minutos, confirmação de 5 minutos e recuperação de 5 minutos.
- Better Stack Telemetry mantém a fonte `AgendFined Vercel` ativa. O monitor de disponibilidade `AgendFined produção` (ID `5024662`) foi criado para `https://agendfined.com.br`, com checagem a cada 3 minutos, confirmação após 5 minutos de falha e e-mail para `diovannydev@gmail.com`.
- A CSP publicada permite os endpoints regionais do Google Analytics; ainda é necessário confirmar um hit real no DebugView/tempo real.

## Critério de conclusão

O site deve estar acessível por HTTPS, mensurável, recuperável em caso de falha e acompanhado por indicadores e responsáveis definidos.

