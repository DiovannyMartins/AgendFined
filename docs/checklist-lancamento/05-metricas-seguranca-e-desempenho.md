# Fase 5 — Métricas, segurança e desempenho

## Objetivo

Medir o comportamento do site, proteger os dados e confirmar que a aplicação suporta o lançamento com desempenho aceitável.

## Itens relacionados

- [ ] 2. Verificar velocidade do site antes do lançamento
- [x] 15. Integrar web analytics
- [x] 16. Confirmar domínio
- [x] 23. Conectar ou transferir domínio
- [x] 40. Publicar o site
- [ ] 41. Fazer backup
- [x] 43. Verificar SSL
- [~] 45. Verificar análises
- [ ] 46. Testar velocidade em produção
- [ ] 48. Criar monitoramento de desempenho
- [ ] 50. Criar plano de manutenção

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
- Pendente: confirmar o recebimento de um evento em DebugView/tempo real do Google Analytics.

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

## Critério de conclusão

O site deve estar acessível por HTTPS, mensurável, recuperável em caso de falha e acompanhado por indicadores e responsáveis definidos.

