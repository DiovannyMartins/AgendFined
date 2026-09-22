# Implementation Plan: E-mail profissional de confirmação

**Branch**: `003-email-confirmation-design` | **Date**: 2026-09-21 | **Spec**: [spec.md](spec.md)

## Summary

Adicionar uma representação HTML responsiva e compatível com clientes de e-mail ao envio de confirmação já existente, mantendo a versão texto puro e o contrato do Resend. O template será construído em `lib/email/booking-confirmation.ts` com CSS inline, paleta monocromática do site e escaping dos valores dinâmicos.

## Technical Context

**Language/Version**: TypeScript 5, Node.js 22+, Next.js 16 App Router.

**Primary Dependencies**: `fetch` nativo e Resend via HTTP; nenhuma dependência nova.

**Storage**: N/A.

**Testing**: Vitest unitário em `lib/email/booking-confirmation.test.ts`, além de `npm run lint` e `npm run typecheck`.

**Target Platform**: Runtime server-side do Next.js e clientes de e-mail comuns.

**Project Type**: Aplicação web.

**Performance Goals**: Não adicionar chamadas de rede nem processamento relevante; manter o timeout de 8 segundos do provedor.

**Constraints**: Resend server-only; CSS inline; sem imagem/fonte externa; manter `SendResult`, assunto, destinatário e fallback de texto.

**Scale/Scope**: Um template de e-mail transacional e seus testes unitários.

## Constitution Check

- **Preserve architecture**: passa; altera somente o módulo de e-mail já usado pela server action.
- **Reuse before create**: passa; reutiliza `formatWhen`, `fetch` e o Resend já integrado, sem dependências novas.
- **No breaking changes**: passa; mantém o contrato da função, do assunto, do remetente e da parte `text`.
- **Consistency/security**: passa; dados dinâmicos serão escapados, segredos continuam server-only e o envio segue após a reserva criada.
- **Quality gates**: serão adicionados testes do módulo e executados lint/typecheck/test.

## Project Structure

```text
lib/email/booking-confirmation.ts       # template HTML + texto e envio Resend
lib/email/booking-confirmation.test.ts # contrato do payload e escaping
specs/003-email-confirmation-design/   # artefatos Spec Kit
```

**Structure Decision**: manter a implementação no módulo server-side existente; o HTML é um detalhe da mensagem, não um componente React ou rota.

## Implementation Detail

- Gerar `text` com o conteúdo atual.
- Gerar `html` usando documento completo com estilos inline, cabeçalho AgendFined, estado de confirmação, tabela de detalhes e rodapé.
- Usar helper `escapeHtml` para qualquer valor inserido no HTML.
- Enviar ambos os campos no mesmo POST ao Resend.
