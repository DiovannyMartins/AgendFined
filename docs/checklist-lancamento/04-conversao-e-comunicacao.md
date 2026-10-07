# Fase 4 — Conversão e comunicação

## Objetivo

Preparar os canais para captar interessados, atender visitantes e divulgar o lançamento.

**Status da fase:** parcial — a home possui um formulário de interesse individual com consentimento, anti-bot e rate limit; o suporte é assíncrono por e-mail; o Instagram foi confirmado. Não existe newsletter, chat ao vivo nem lista de contatos persistente, e a divulgação depende de aprovação.

## Itens relacionados

- [~] 19. Adicionar formulário de inscrição por email — **formulário de interesse individual, não newsletter.** Implementado na home (`components/marketing/interest-form.tsx`, `lib/marketing/actions.ts`, `lib/email/interest.ts`), com testes unitários da server action e do envio. Falta registrar um envio real em produção (notificação ao suporte e confirmação ao visitante).
- [x] 22. Criar links para redes sociais — Instagram confirmado: `https://www.instagram.com/agendfined/`.
- [~] 34. Configurar chat ou suporte ao vivo — suporte por e-mail implementado (`agendfined@outlook.com`, widget “Suporte”), mas **não há chat ao vivo** e não há SLA nem responsável definidos.
- [!] 38. Organizar lista de contatos — não existe lista persistente: cada interesse vira um e-mail na caixa de suporte. Depende de decisão do responsável: manter a caixa de suporte como registro operacional ou criar uma lista com consentimento e descadastro.
- [!] 39. Preparar redes sociais para divulgação — depende de perfis, conteúdo e aprovação; materiais em [seo-off-page.md](./seo-off-page.md).
- [!] 47. Promover o site — depende de autorização explícita para publicar campanhas.

## Formulário de interesse — como funciona

| Aspecto | Comportamento verificado no código |
| --- | --- |
| Finalidade | Responder sobre novidades e o lançamento; texto do consentimento exibido junto ao campo. |
| Consentimento | Checkbox obrigatório, validado no servidor (`consent === "on"`). |
| Armazenamento | Nenhum banco/lista; o e-mail é enviado ao suporte (`reply_to` do visitante) e uma confirmação ao visitante via Resend. A auditoria registra só o evento `marketing.interest_signup`, sem o e-mail. |
| Anti-bot | Honeypot `website` (aceita silenciosamente sem enviar e-mail) e Turnstile com ação `interest_signup`. |
| Rate limit | `enforceInterestRateLimit` por IP e e-mail; se o limitador falhar, a ação recusa (`RATE_LIMIT_UNAVAILABLE`). |
| Indisponibilidade do Resend | Retorna erro (`EMAIL_NOT_CONFIGURED`/`EMAIL_PROVIDER_ERROR`) e não exibe sucesso. |
| Mensagem de sucesso | “Interesse registrado. Enviamos uma confirmação para seu e-mail.” — só aparece quando ambos os envios retornaram 2xx. |
| Privacidade | A política (seção 3) informa que inscrições de interesse vão ao suporte e não entram em campanhas recorrentes sem nova autorização. |
| Acessibilidade | Label (oculto visualmente) no e-mail, checkbox dentro do `label`, erro anunciado com `role="alert"`. |

Correção desta revisão: os e-mails em texto usavam `"\\n"` literal e chegavam com “\n” visível; agora usam quebra de linha real (coberto por teste). O honeypot era rejeitado pelo schema antes do caminho silencioso; agora segue o comportamento documentado.

## Instruções

1. Manter o cadastro de contas no Supabase Auth, sem criar lista de newsletter.
2. Não descrever o formulário de interesse como newsletter enquanto não houver lista persistente, gestão de consentimento e descadastro.
3. Inserir links sociais reais e conferir se cada perfil está ativo.
4. Manter o suporte por e-mail em `agendfined@outlook.com`.
5. Preparar biografias, imagens, links e posts para os perfis sociais.
6. Criar uma sequência de lançamento para posts, stories e divulgação direta.
7. Medir cliques, cadastros e reservas originadas por cada canal.

## Checklist de divulgação (preparação, sem publicar)

- [ ] Bio do Instagram com o link `https://agendfined.com.br`.
- [ ] 3 a 6 posts de lançamento com imagem real do produto e CTA para `/cadastro`.
- [ ] Links com parâmetros UTM sem e-mail, telefone, nome ou código de reserva.
- [ ] Calendário de publicação de T-7 a T+14 em relação a 1º de dezembro de 2026.
- [ ] Aprovação do responsável registrada antes de qualquer publicação.

## Dependências externas

- Textos comerciais aprovados.
- Autorização para publicar campanhas.
- Decisão sobre lista de contatos (item 38) e sobre chat ao vivo/SLA (item 34).

## Evidências obrigatórias

- Links sociais conferidos.
- Envio real do formulário de interesse registrado (data, sem expor o e-mail).
- Calendário de divulgação aprovado.

## Critério de conclusão

Um visitante deve conseguir entrar em contato, encontrar as redes sociais e entender claramente o próximo passo.
