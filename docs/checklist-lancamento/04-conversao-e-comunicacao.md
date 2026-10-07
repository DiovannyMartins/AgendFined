# Fase 4 — Conversão e comunicação

## Objetivo

Preparar os canais para captar interessados, atender visitantes e divulgar o lançamento.

**Status da fase:** parcial — o site não capta e-mails (decisão do responsável); o suporte é assíncrono por e-mail; o Instagram foi confirmado. Não há chat ao vivo, e a divulgação depende de aprovação.

## Itens relacionados

- [x] 22. Criar links para redes sociais — Instagram confirmado: `https://www.instagram.com/agendfined/`.
- [~] 34. Configurar chat ou suporte ao vivo — suporte por e-mail implementado (`agendfined@outlook.com`, widget “Suporte”), mas **não há chat ao vivo** e não há SLA nem responsável definidos.
- [!] 39. Preparar redes sociais para divulgação — depende de perfis, conteúdo e aprovação; materiais em [seo-off-page.md](./seo-off-page.md).
- [!] 47. Promover o site — depende de autorização explícita para publicar campanhas.

## Formulário de interesse — removido

Em 6 de outubro de 2026 o responsável decidiu não captar e-mails no site. A seção “Fique por dentro” da home, o formulário, a server action, o envio pelo Resend, o rate limit e a ação do Turnstile correspondentes foram removidos, e a política de privacidade deixou de mencionar inscrições de interesse. Os itens 19 (formulário de inscrição) e 38 (lista de contatos) ficam fora do escopo.

## Instruções

1. Manter o cadastro de contas no Supabase Auth, sem criar lista de newsletter.
2. Não reintroduzir captação de e-mails sem consentimento, lista persistente e descadastro.
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
- Decisão sobre chat ao vivo/SLA (item 34).

## Evidências obrigatórias

- Links sociais conferidos.
- Calendário de divulgação aprovado.

## Critério de conclusão

Um visitante deve conseguir entrar em contato, encontrar as redes sociais e entender claramente o próximo passo.
