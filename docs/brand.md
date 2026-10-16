# Identidade visual do AgendFined

A marca aprovada combina a letra “a” com um ponteiro. As assinaturas vetoriais em `public/brand/` são a fonte usada pela aplicação e preservam as curvas do desenho aprovado, inclusive a tipografia.

## Aplicação

Use `BrandLogo` de `components/brand-logo.tsx` para a assinatura branca; a opção `symbol` mostra apenas o monograma. O componente inclui o nome acessível “AgendFined” e dimensões intrínsecas. A assinatura escura está disponível como SVG para materiais de fundo claro.

No menu de telas estreitas, aparece somente o símbolo, deixando espaço para as ações. Na página pública do negócio e nas telas de consulta e confirmação, a marca fica no rodapé “Reservas por”, sem substituir a identidade do negócio. Ícones funcionais de calendário, serviços e reservas continuam representando suas funções.

## Arquivos derivados

- `app/favicon.ico`: símbolo em fundo escuro, com tamanhos 16, 32 e 48 px.
- `app/icon.svg`: ícone vetorial para navegadores modernos.
- `app/apple-icon.png`: ícone opaco de 180 px para atalhos Apple.
- `public/brand/icon-192.png` e `icon-512.png`: ícones do manifesto.
- `public/brand/social.png`: compartilhamento, 1200 × 630 px, usado pelo Open Graph e Twitter.

O manifesto define aparência e ícones de atalhos; não fornece funcionamento offline. Os arquivos raster foram renderizados a partir dos SVGs aprovados. Ao alterar a marca, atualize também esses derivados.

Paleta: `#141414`, `#FFFFFF`, `#EEEEEE`, `#242424`, `#333333` e `#B0B0B0`, conforme `app/globals.css`.

Os e-mails preservam a versão textual compatível com leitores que bloqueiam imagens, conforme a spec `003-email-confirmation-design`; esta implementação aplica a identidade ao site e aos seus metadados.
