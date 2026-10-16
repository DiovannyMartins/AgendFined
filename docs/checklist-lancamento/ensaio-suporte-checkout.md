# Ensaio de suporte — checkout PROFISSIONAL

**Estado:** roteiro preparado; execução pendente em ambiente de teste, que o responsável fará com um comprador convidado. Não incluir nome, e-mail, telefone, tokens, payloads de webhook ou dados de produção neste registro.

## Preparação

- [ ] Confirmar com Engenharia/QA que a conta está no sandbox e que o `init_point` é de sandbox.
- [ ] Usar um negócio de teste sem clientes ou reservas reais.
- [ ] Ter acesso ao dashboard e ao caminho de logs do webhook/reconciliação.
- [ ] Registrar horário UTC, ambiente, resultado e identificadores técnicos mascarados.

## Cenários e resposta esperada

| Cenário | Verificação técnica | Resposta que o suporte deve dar | Resultado |
| --- | --- | --- | --- |
| Checkout abandonado | Negócio continua Grátis; tentativa fica pendente; botão gera nova tentativa segura | Orientar a reabrir Plano nas configurações e usar “Concluir pagamento”; não afirmar que houve cobrança | Pendente |
| Pagamento autorizado, tela ainda mostra Grátis | Verificar estado no Mercado Pago, webhook e job de reconciliação; atualizar a tela após sincronização | Confirmar que o retorno do navegador não ativa o plano sozinho; investigar webhook/reconciliação e não pedir dados de cartão | Pendente |
| Cancelamento solicitado | Pré-aprovação cancelada, status local atualizado e término da carência exibido | Explicar interrupção de novas cobranças e data final de acesso conforme o painel | Pendente |
| Assinatura pausada/cobrança recusada | Status paused e carência até 7 dias; após expiração o negócio volta ao Grátis | Orientar a corrigir o pagamento diretamente no Mercado Pago e explicar os recursos afetados após o prazo | Pendente |
| Clique repetido/falha de rede | Idempotência/claim impede duplicidade ou mostra tentativa aguardando reconciliação | Pedir para aguardar e tentar novamente depois; não solicitar novo pagamento às cegas | Pendente |

## Registro da execução

- Data/hora e fuso:
- Responsável pela execução:
- Ambiente/versão:
- Resultado por cenário:
- Incidente ou issue criada (sem dados pessoais):
- Aprovação do roteiro por suporte/produto:

## Contato e prazo de atendimento

- Canal documentado: `agendfined@outlook.com`.
- Responsável principal: a definir pelo responsável do lançamento.
- Substituto: a definir.
- Prazo interno de primeira resposta: a definir pelo responsável e comunicar sem prometer resolução nesse prazo.
- Para relações de consumo abrangidas pelo Decreto 7.962/2013, a manifestação sobre demandas enviadas por meio eletrônico deve ser encaminhada em até cinco dias. Validar com assessoria jurídica como o dever se aplica ao público e ao modelo B2B/B2C do AgendFined.

Não prometa prazo de resolução. Para divergência entre cobrança e estado da assinatura, escale para a pessoa com acesso ao Mercado Pago e à operação técnica; nunca solicite senha, CVV ou número completo do cartão.

## Escalonamento recomendado

1. **Suporte:** confirmar o e-mail de login do negócio apenas pelo canal oficial; nunca pedir credenciais de pagamento. Coletar horário aproximado, estado exibido e código técnico não sensível.
2. **Billing/engenharia:** consultar a pré-aprovação pelo painel/API e os logs de webhook/reconciliação; comparar o estado confirmado do provedor com o painel do AgendFined.
3. **Cobrança/estorno:** encaminhar pedido ao responsável com acesso ao Mercado Pago; registrar protocolo e atualizar o solicitante pelo canal oficial.
4. **Segurança ou vazamento:** não incluir dados pessoais em issues/logs; seguir o runbook de incidente em `operacao-pos-lancamento.md`.
