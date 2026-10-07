# Fase 5 — Métricas, segurança e desempenho

## Objetivo

Medir o comportamento do site, proteger os dados e confirmar que a aplicação suporta o lançamento com desempenho aceitável.

**Status da fase:** parcial — aplicação, domínio, SSL, logs, backup, restauração isolada e alertas operacionais têm evidência; o hit do Analytics foi confirmado em tempo real em 6 de outubro; o LCP mobile continua acima do limite e o plano de manutenção não tem responsável/SLA.

## Itens relacionados

- [~] 2. Verificar velocidade do site antes do lançamento — medição feita: o LCP mobile caiu de aproximadamente 13,6 s para 4,4 s e o desempenho subiu para 76; ainda acima do limite aprovado de 2,5 s.
- [x] 15. Integrar web analytics — tag condicionada a `NEXT_PUBLIC_GA_MEASUREMENT_ID` válido, eventos sem PII e testes unitários de `gtag`/`dataLayer` (`lib/analytics.test.ts`). O recebimento de hits é o item 45.
- [x] 16. Confirmar domínio
- [x] 23. Conectar ou transferir domínio
- [x] 40. Publicar o site
- [x] 41. Fazer backup — workflow manual concluído com artefato e retenção de 30 dias; o drill isolado `37418154732` restaurou os dumps público e Auth em banco descartável (13 usuários Auth) e validou dados, RLS e FKs. Desde esta revisão o drill também **falha** se `auth.users = 0`, se alguma contagem vier vazia e em qualquer erro de pipeline (`bash -euo pipefail`), e só aceita artefatos do workflow de backup no branch padrão; reexecutado com essas asserções no run `37557120032` (6 de outubro de 2026, 1m48s): sucesso em todas as etapas, incluindo a verificação de dados, RLS e FKs.
- [x] 43. Verificar SSL
- [x] 45. Verificar análises — **confirmado em 6 de outubro de 2026, 20h40 (AMT):** visita a `https://agendfined.com.br` gerou requisição a `www.google-analytics.com/g/collect` e o Google Analytics mostrou 1 usuário ativo nos últimos 30 minutos (Brasil). A CSP em produção já permitia esse coletor; a ausência de hit no Tag Assistant provavelmente veio de bloqueio no navegador daquela sessão. A CSP ampliada no código cobre também coletores regionais. Texto anterior: Tag Assistant encontrou `G-92YJVL0YB0`, mas nenhum hit foi enviado. A CSP publicada não liberava os coletores regionais `*.analytics.google.com` nem `*.googletagmanager.com` em `connect-src`/`img-src`, o que pode bloquear o envio; a CSP foi ampliada conforme a orientação do Google e precisa ser publicada. Depende do responsável confirmar o hit (passos abaixo).
- [~] 46. Testar velocidade em produção — **nova medição em 6 de outubro de 2026, 20h43 (PageSpeed, Moto G Power emulado, 4G lento):** desempenho 62, LCP 9,8 s, FCP 4,1 s, TBT 20 ms, CLS 0, SI 5,6 s; acessibilidade 96, boas práticas 92, SEO 100. O LCP é texto da hero com 2,6 s de atraso de renderização; o maior bloqueio é o CSS do Google Fonts (750 ms). **Após o deploy do PR #47 (fontes via `next/font`), 6 de outubro de 2026, ~21h30:** desempenho 78, LCP 4,8 s, FCP 2,7 s; o Google Fonts saiu das requisições bloqueantes (resta só o CSS próprio, 18 KiB/170 ms) e o atraso de renderização do texto LCP caiu de 2,6 s para 1,09 s. Ainda acima de 2,5 s. **Ajustes seguintes (aguardando deploy):** removido o formulário de interesse e, com ele, o Turnstile da home; trocados o `backdrop-blur` em tela cheia e as manchas `blur-[120px] mix-blend-screen` da hero por gradientes radiais; o vídeo HLS decorativo não carrega em telas < 768 px nem com economia de dados e só começa após o evento `load`. **Após a home estática (PR #55), 6 de outubro de 2026, 23h15:** desempenho 81, FCP 1,7 s, Speed Index 2,5 s, TBT 140 ms, CLS 0, LCP 4,7 s (laboratório, Moto G Power emulado, 4G lento); acessibilidade 100. Causa encontrada: a home era renderizada por requisição para consultar a sessão, com TTFB real de ~1,7 s; agora sai do cache da Vercel (`x-vercel-cache: HIT`, 85–300 ms). Numa navegação real no Chrome o LCP coincide com o FCP; o LCP de 4,7 s é estimativa simulada do Lighthouse. Medição anterior:  desempenho 76, acessibilidade 96, boas práticas 92, SEO 100, FCP 2,7 s, TBT 240 ms, CLS 0,037, LCP 4,4 s. Só conclui quando atingir 2,5 s ou o responsável aprovar outro limite.
- [x] 48. Criar monitoramento de desempenho — monitor de disponibilidade, alerta 5xx e heartbeat de backup ativo no Better Stack.
- [~] 50. Criar plano de manutenção — runbook em [operacao-pos-lancamento.md](./operacao-pos-lancamento.md) com periodicidade, canal de alerta, incidente e rollback; responsável, substituto e SLA ainda não foram informados.

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
- O carregamento está condicionado a `NEXT_PUBLIC_GA_MEASUREMENT_ID`; a fila inline e o carregador assíncrono seguem o snippet oficial do Google.
- A CSP foi ajustada para permitir o Google Tag e os endpoints de coleta.
- Eventos agregados implementados: `sign_up`, `login`, `business_created` e `booking_complete`.
- Nenhum evento envia e-mail, telefone, nome, código de reserva ou identificador de usuário.
- A variável `NEXT_PUBLIC_GA_MEASUREMENT_ID` foi cadastrada na Vercel para Production.
- O código está publicado em produção e o carregamento do Google Analytics foi validado no HTML/CSP do domínio oficial.
- O Tag Assistant encontrou a tag `G-92YJVL0YB0`, mas exibiu “Esta tag não enviou nenhum hit”; a confirmação de evento permanece bloqueada até o Google Analytics receber um hit.
- Hipótese corrigida no código: a CSP permitia só `analytics.google.com` (sem subdomínios) e não incluía `*.googletagmanager.com` em `connect-src`/`img-src`. Agora segue a lista do Google para GA4 e há teste em `lib/security/next-config.test.ts`. Sem `page_view` manual: o único `page_view` vem do `config` (`send_page_view: true`).
- Se um bloqueador impedir o `gtag.js`, os eventos ficam na fila `dataLayer` sem erro (coberto por teste).

### Passos para o responsável validar o item 45

1. Publicar a versão com a nova CSP.
2. Abrir `https://agendfined.com.br` numa janela sem bloqueador de anúncios.
3. No DevTools › Network, filtrar por `collect` e confirmar uma requisição `g/collect` com status 204, sem erro de CSP no Console.
4. No Google Analytics › Relatórios › Tempo real (ou Admin › DebugView com o Tag Assistant conectado), confirmar o `page_view`.
5. Criar uma conta de teste ou fazer login para ver `sign_up`/`login`; registrar data e captura sem dados pessoais.

### Desempenho — baseline e próximos passos

Baseline (PageSpeed mobile, produção, home): desempenho 76, LCP ≈ 4,4 s, FCP ≈ 2,7 s, TBT ≈ 240 ms, CLS ≈ 0,037, ≈ 298 KiB de JavaScript não usado, 5 tarefas longas.

Já aplicado antes desta revisão: imagem da hero em WebP com `priority`/`fetchPriority="high"`, vídeo HLS com `preload="none"`, `hls.js` importado dinamicamente 1,5 s após a montagem e desativado com `prefers-reduced-motion`.

Hipóteses a medir antes de alterar (nenhuma mudança de desempenho foi feita nesta revisão por falta de medição autorizada em produção):

1. O elemento LCP provavelmente é o `h1` com gradiente ou a imagem coberta por `bg-black/65 backdrop-blur-[2px]` em tela cheia; `backdrop-filter` em toda a hero é caro em GPU móvel.
2. Componentes client acima da dobra (`HeroVideo`, `InterestForm` com Turnstile, `SupportWidget`, `Reveal`) aumentam hidratação e TBT.
3. Turnstile e Google Analytics entram como terceiros na página inicial.

Registrar para cada nova medição: URL, data, dispositivo, ferramenta, métricas antes/depois e link do relatório.

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
- Validação técnica mais recente: ver a seção “Validação técnica” no [README](./README.md).
- Runbook de operação, backup, rollback e manutenção registrado em `docs/checklist-lancamento/operacao-pos-lancamento.md`.
- `npm run check:launch -- --production` passou nas variáveis, `/`, `/robots.txt`, `/sitemap.xml`, CSP e referência canônica; houve apenas o aviso de que o segredo do scheduler de reconciliação não está configurado.
- PageSpeed foi repetido em produção após a última otimização: desempenho mobile 76, LCP 4,4 s, FCP 2,7 s, TBT 240 ms, CLS 0,037, acessibilidade 96, boas práticas 92 e SEO 100. O relatório ainda apontou 298 KiB de JavaScript não usado e 5 tarefas longas.
- O sitemap `https://agendfined.com.br/sitemap.xml` respondeu HTTP 200 com XML válido e foi reenviado no Search Console em 6 de outubro de 2026; o Google ainda está processando a leitura.
- O workflow manual de backup #42 concluiu com sucesso no GitHub Actions em 38 s, publicou um artefato e renovou o heartbeat. O Better Stack mostra `AgendFined backup freshness` como `Up`, esperado a cada 18 horas, com último heartbeat recente.
- O workflow de drill isolado `37418154732` concluiu com sucesso em 1m36s: restaurou 3 businesses, 19 bookings, 5 customers e 13 usuários Auth; encontrou 0 tabelas públicas sem RLS e 15 FKs. Essa execução é anterior à asserção explícita de `auth.users > 0`.
- O alerta de erros 5xx foi salvo no Better Stack para a fonte `AgendFined Vercel`, usando consulta Log SQL, limiar acima de zero, janela de 5 minutos, confirmação de 5 minutos e recuperação de 5 minutos.
- Better Stack Telemetry mantém a fonte `AgendFined Vercel` ativa. O monitor de disponibilidade `AgendFined produção` (ID `5024662`) foi criado para `https://agendfined.com.br`, com checagem a cada 3 minutos, confirmação após 5 minutos de falha e e-mail para `diovannydev@gmail.com`.
- A CSP publicada permite os endpoints regionais do Google Analytics; ainda é necessário confirmar um hit real no DebugView/tempo real.

## Critério de conclusão

O site deve estar acessível por HTTPS, mensurável, recuperável em caso de falha e acompanhado por indicadores e responsáveis definidos.

