# Fase 3 — SEO e acessibilidade

## Objetivo

Permitir que mecanismos de busca encontrem o site e garantir que pessoas com diferentes necessidades consigam navegar e usar suas funções principais.

**Status da fase:** parcial — SEO técnico e verificações E2E passaram; Search Console e auditoria completa de acessibilidade ainda estão pendentes.

## Itens relacionados

- [x] 21. Otimizar SEO on-page
- [x] 22. Criar links para redes sociais — Instagram: `https://www.instagram.com/agendfined/`.
- [~] 32. Auditar acessibilidade — skip link e foco da home cobertos por E2E; falta auditoria automatizada completa e leitor de tela.
- [x] 36. Publicar política de privacidade
- [x] 37. Planejar SEO off-page — plano local registrado em `docs/checklist-lancamento/seo-off-page.md`.
- [!] 44. Enviar site para indexação — depende de acesso e aprovação no Google Search Console.

## Instruções de SEO

1. Definir um título único e uma descrição útil para cada página pública.
2. Conferir um único `h1` principal e uma hierarquia lógica de headings.
3. Revisar URLs, textos âncora, canonical, Open Graph e imagem de compartilhamento.
4. Adicionar `sitemap.xml` com as rotas públicas relevantes.
5. Adicionar `robots.txt` sem bloquear páginas que precisam ser indexadas.
6. Conferir que páginas privadas e dados de clientes não sejam indexáveis.
7. Criar um plano off-page com conteúdo, parcerias, citações e links legítimos.
8. Configurar o Google Search Console, verificar o domínio e enviar o sitemap.

## Instruções de acessibilidade

1. Navegar pelas páginas apenas com teclado.
2. Conferir foco visível, ordem de tabulação e operação de menus e formulários.
3. Validar contraste de textos, botões, links e estados de foco.
4. Garantir labels associados aos campos e mensagens de erro compreensíveis.
5. Conferir textos alternativos para imagens informativas e marcar imagens decorativas corretamente.
6. Verificar que vídeos não sejam essenciais para entender o conteúdo.
7. Testar com leitor de tela quando possível.
8. Rodar uma auditoria automatizada e revisar manualmente cada alerta.

## Evidências obrigatórias

- Relatório de SEO técnico.
- Conteúdo de `sitemap.xml` e `robots.txt`.
- Resultado do Search Console.
- Relatório de acessibilidade automatizado.
- Lista dos testes manuais de teclado e leitor de tela.
- Política de privacidade publicada e acessível.

## Critério de conclusão

As páginas públicas devem possuir metadados coerentes, sitemap enviado e nenhum problema crítico de acessibilidade ou indexação.

## Implementação e evidências desta execução

- `app/robots.ts` publica regras para APIs, painel, autenticação, consulta e confirmação.
- `app/sitemap.ts` publica home, páginas legais e negócios ativos; a lista de negócios é atualizada por revalidação.
- A home possui canonical, Open Graph, Twitter Card e imagem de compartilhamento.
- Páginas públicas de negócio recebem título, descrição, canonical e Open Graph por slug.
- Login, cadastro, recuperação, MFA, dashboard, consulta e confirmação usam `noindex, nofollow`.
- Skip links foram adicionados ao marketing, autenticação e dashboard.
- Os testes E2E de SEO passaram em desktop e mobile.
- Pendente: enviar o sitemap ao Google Search Console e concluir auditoria manual/automatizada completa de acessibilidade.
- O plano de SEO off-page foi registrado sem criar perfis, publicar links ou executar campanhas externas.
- A execução focada de E2E confirmou os endpoints públicos, canonical, metadata e `noindex` em desktop e mobile.

