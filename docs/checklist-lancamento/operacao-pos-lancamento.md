# Operação pós-lançamento

Runbook local para o lançamento de 1º de dezembro de 2026. Não contém secrets e não executa alterações
em Vercel, Supabase, Resend, Mercado Pago ou DNS.

## Indicadores e limites

| Indicador | Limite inicial | Ação |
| --- | --- | --- |
| Disponibilidade da home, `/robots.txt` e `/sitemap.xml` | HTTP 200 | Abrir incidente e verificar o último deploy |
| Erros 5xx | Qualquer aumento sustentado por 5 minutos | Pausar divulgação e avaliar rollback |
| LCP mobile da home | até 2,5 s | Investigar imagens, vídeo, fontes e JavaScript |
| CLS mobile da home | até 0,1 | Verificar dimensões de imagens e fontes |
| Reserva pública com erro | Qualquer falha reproduzível | Verificar Supabase, Turnstile, Resend e logs sem expor dados |
| Backup | Execução e retenção conforme o plano contratado | Confirmar no painel do provedor e registrar evidência |

## Rotina

- **A cada deploy:** executar `npm run lint`, `npm run typecheck`, `npx vitest run --project unit` e os E2E
  afetados; executar `npm run check:launch -- --production` a partir de uma rede com acesso ao domínio.
- **Semanal:** verificar a home, login, cadastro, uma página pública de reserva, confirmação, consulta,
  cancelamento, `robots.txt`, `sitemap.xml` e os eventos agregados do Analytics.
- **Mensal:** revisar dependências, headers, CSP, rotas privadas, acessibilidade por teclado e conteúdo legal.
- **Trimestral:** testar restauração de backup em ambiente isolado, revisar contatos de emergência e repetir
  a medição de performance desktop/mobile.

## Backup e restauração

1. Confirmar no painel do provedor o backup automático, a retenção e o horário da última execução.
2. Restaurar uma cópia em ambiente isolado, nunca sobre a produção.
3. Validar autenticação, disponibilidade, reserva, consulta e cancelamento com dados de teste.
4. Registrar data, responsável, versão do schema e resultado; remover o ambiente de teste conforme a política.

Essa rotina depende de acesso ao provedor e de uma decisão sobre retenção. A restauração não deve ser feita
com dados reais neste repositório.

## Incidente e rollback

1. Registrar horário, URL afetada, status HTTP e digest do erro; não registrar tokens ou dados do cliente.
2. Verificar logs e o último deploy conhecido.
3. Se o problema veio do último deploy, solicitar rollback pela hospedagem e pausar mudanças concorrentes.
4. Revalidar os fluxos principais e comunicar o responsável pelo lançamento.
5. Após a recuperação, abrir uma tarefa com causa, impacto e prevenção.

## Responsabilidades e SLA

- **Responsável principal:** não informado.
- **Substituto:** não informado.
- **SLA de suporte / expectativa de resposta:** não informado. O suporte é assíncrono por `agendfined@outlook.com`.
- **Canal de alerta:** e-mail da conta Better Stack (uptime, 5xx e heartbeat de backup).

Enquanto esses campos não forem preenchidos pelo responsável, o item 50 permanece parcial.

## Aprovações externas pendentes

- Confirmar um hit do Google Analytics no DebugView/tempo real; a tag foi encontrada, mas a sessão do Tag Assistant não mostrou hit enviado.
- Aguardar o processamento do sitemap reenviado no Search Console; o endpoint público responde HTTP 200 e XML válido.
- Reexecutar o drill isolado após as novas asserções (`auth.users > 0`, contagens não vazias, `pipefail`). A execução `37418154732` validou 3 businesses, 19 bookings, 5 customers, 13 usuários Auth, 0 tabelas públicas sem RLS e 15 FKs.

## Monitoramento configurado

- Better Stack Uptime: monitor `AgendFined produção` (ID `5024662`) para `https://agendfined.com.br`.
- Frequência: 3 minutos; confirmação de falha: 5 minutos; recuperação: 3 minutos.
- Canal configurado: e-mail para a conta `diovannydev@gmail.com`.
- A fonte Better Stack Telemetry `AgendFined Vercel` permanece ativa para logs.
- Alerta 5xx: consulta Log SQL na fonte `AgendFined Vercel`, disparo quando a porcentagem de respostas 5xx fica acima de zero por 5 minutos, com recuperação após 5 minutos.
- Heartbeat de backup: `AgendFined backup freshness`, esperado a cada 18 horas, e-mail para a conta `diovannydev@gmail.com`; o workflow de backup renova o heartbeat após publicar o artefato.
