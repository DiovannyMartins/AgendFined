# Research: Checkout direto para usuários autenticados

## Decisão 1: verificar a sessão no Server Component da página

- **Decision**: `app/(marketing)/page.tsx` será assíncrona e consultará `createClient().auth.getUser()` no servidor antes de renderizar `Plans`.
- **Rationale**: a decisão de mostrar o fluxo autenticado deve usar a sessão protegida pelo servidor e evitar uma troca visual ou um redirecionamento intermediário para o dashboard.
- **Alternatives considered**: consultar auth no navegador após o carregamento adicionaria latência e permitiria renderizar inicialmente o CTA errado; usar a sessão já lida pelo layout exigiria uma nova camada de contexto entre Server Components.

## Decisão 2: reutilizar `startUpgrade`

- **Decision**: o CTA autenticado chamará o server action `startUpgrade` de `lib/billing/actions.ts`.
- **Rationale**: esse fluxo já aplica preço, elegibilidade do negócio, idempotência, Mercado Pago, URL de retorno e mensagens de erro. A feature não deve criar um segundo caminho de pagamento.
- **Alternatives considered**: criar uma rota ou ação específica para marketing duplicaria regras de billing; navegar para o dashboard manteria a etapa que o usuário pediu para remover.

## Decisão 3: navegar na mesma aba após a chamada assíncrona

- **Decision**: o Client Component atribuirá o `initPoint` à navegação da janela atual somente depois que o server action concluir.
- **Rationale**: o usuário solicitou que os botões `Fazer upgrade` e `Assinar PROFISSIONAL` não abram nova aba. A navegação ocorre apenas com um checkout válido, e falhas permanecem na página atual.
- **Alternatives considered**: `window.open` exigiria popup e criaria uma aba extra; redirecionar antes do retorno do server action não teria uma URL de checkout válida.

## Decisão 4: falhas permanecem no card de planos

- **Decision**: falhas aparecem como mensagem inline no CTA e não navegam para fora da página atual.
- **Rationale**: preserva a página de marketing e reutiliza as mensagens de domínio retornadas pelo billing para negócio ausente, ambiente não configurado ou assinatura já existente.
- **Alternatives considered**: redirecionar ao dashboard em erro seria inesperado e não resolve a falha; usar alert nativo é menos acessível e menos consistente com a UI.

## Decisão 5: retry automático para checkout pendente

- **Decision**: quando `startUpgrade` retornar `UPGRADE_PENDING`, o CTA chamará `retryUpgrade` e usará o novo `initPoint` retornado.
- **Rationale**: o billing já possui um fluxo de retry protegido por tentativa esperada e idempotência. Reutilizá-lo permite que o botão público resolva o checkout abandonado sem duplicar regras nem mandar o usuário ao dashboard.
- **Alternatives considered**: exibir somente a mensagem deixa o usuário bloqueado; chamar `retryUpgrade` sempre falha para contas sem pagamento pendente; criar um novo endpoint duplicaria o orquestrador existente.
