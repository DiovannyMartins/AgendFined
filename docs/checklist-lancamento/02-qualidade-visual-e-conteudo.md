# Fase 2 — Qualidade visual e conteúdo

## Objetivo

Garantir que o site esteja visualmente consistente, claro, responsivo e livre de erros de conteúdo antes da publicação.

**Status da fase:** concluída em 6 de outubro de 2026 (item 13 aceito no estado atual pelo responsável).

## Itens relacionados

- [x] 13. Otimizar fotos e vídeos — imagem principal convertida para WebP; o vídeo remoto HLS depende do provedor e ainda requer medição em produção. **Aceito no estado atual pelo responsável em 6 de outubro de 2026.**
- [x] 14. Adicionar logo e favicon — marca tipográfica com ícone e `app/favicon.ico` presentes e verificados.
- [x] 17. Criar página “Em construção” ou “Em breve” — avaliado como não aplicável porque o site já está publicado.
- [x] 18. Posicionar CTAs
- [x] 20. Revisar experiência mobile
- [x] 24. Atualizar copyright
- [x] 25. Revisar conteúdo escrito
- [x] 26. Testar formulários — validação, erros e sucesso cobertos por testes unitários; reserva pública, login, consulta e cancelamento passaram no E2E em 6 de outubro de 2026 (2 de 2, com limpeza dos dados criados).
- [x] 27. Fazer o logo apontar para a página inicial
- [x] 28. Revisar design
- [x] 30. Verificar links quebrados
- [x] 31. Testar UX — tarefas principais exercitadas por E2E e revisão do responsável; não substitui o teste de usabilidade (42).
- [x] 33. Atualizar informações de contato
- [x] 35. Personalizar página 404 — página com contexto de agenda, navegação de retorno e CTA para recursos.

## Instruções

1. Redimensionar imagens para o maior tamanho em que serão exibidas.
2. Usar formatos adequados, compressão e carregamento otimizado.
3. Conferir logo, favicon, nome da marca e consistência da identidade visual.
4. Criar uma página temporária caso o site precise receber visitantes antes do lançamento.
5. Conferir se cada página tem um CTA principal claro e uma ação seguinte compreensível.
6. Testar a aplicação em telas pequenas, médias e grandes.
7. Revisar todos os textos procurando erros, placeholders, links incorretos e informações antigas.
8. Testar envio, validação, mensagens de erro, estados de carregamento e confirmação de todos os formulários.
9. Confirmar que logos e elementos de marca levam ao início quando clicados.
10. Abrir os links internos e externos em uma lista de verificação.
11. Testar tarefas principais como cadastro, login, configuração do negócio e reserva pública.
12. Conferir telefone, email, endereço, suporte, termos e política de privacidade.
13. Validar a página 404 em uma rota inexistente.

## Evidências obrigatórias

- Capturas ou gravação das páginas principais em desktop e mobile.
- Lista de imagens revisadas.
- Resultado dos testes de formulários.
- Lista de links verificados.
- Resultado das tarefas principais de UX.
- Aprovação final dos textos e da identidade visual.

## Critério de conclusão

Nenhuma página deve conter texto provisório, erro visual conhecido, CTA sem destino, formulário sem resposta ou informação de contato desatualizada.

## Evidências desta execução

- Landing, autenticação, páginas legais, 404 e redirecionamento do painel passaram em desktop e mobile no Playwright.
- CTA principal, links de navegação, seção Sobre, preços e links legais foram exercitados nos testes E2E.
- Foi adicionado skip link para teclado no marketing, autenticação e painel.
- `agendfined@outlook.com` ficou separado do remetente automático `reservas@agendfined.com.br`.
- O E2E de reserva (`tests/e2e/booking.spec.ts`) passou a recusar escrita sem `ALLOW_REMOTE_E2E_WRITES=true` e host em `E2E_ALLOWED_SUPABASE_HOSTS`, valida cada etapa do seed e remove em `afterAll` tudo o que criou (ver [README](./README.md)). Ainda não foi executado com essa proteção.
- A imagem principal `public/images/hero.webp` passou a ser usada na home e no compartilhamento; o PNG original foi preservado como fonte.
- O fallback global `app/global-error.tsx` oferece mensagem em pt-BR e recuperação sem expor a mensagem interna do erro.
- O teste E2E da home confirma foco e ativação do skip link por teclado.
- Execuções anteriores no Windows confirmaram 16 cenários `ok`, mas o runner não encerrou sozinho e deixou processos Node. O `playwright.config.ts` passou a iniciar o servidor com `node … next start` numa porta dedicada (3100), sem `npm run`, sem reutilizar servidor existente por padrão e com encerramento por `SIGTERM`. A validação de duas execuções consecutivas no Windows sem processos órfãos ainda precisa ser registrada (ver [README](./README.md)).

