# Quickstart: verificar o e-mail profissional

1. Configure `RESEND_API_KEY` e `RESEND_FROM_EMAIL` no ambiente server-side, caso queira executar um envio real.
2. Execute os testes unitários:

   ```powershell
   npm run test -- lib/email/booking-confirmation.test.ts
   ```

3. Execute os gates do projeto:

   ```powershell
   npm run typecheck
   npm run lint
   npm run test
   ```

4. Para uma verificação manual, crie uma reserva pública com e-mail e abra a mensagem em Gmail ou Outlook. Confirme o cabeçalho escuro, o bloco de detalhes, a leitura em tela estreita e o conteúdo de fallback.

5. Não exponha `RESEND_API_KEY` ao cliente e não use variáveis `NEXT_PUBLIC_` para o envio.

## Resultado desta implementação

- `npx vitest run --project unit`: passou.
- `npm run typecheck`: passou.
- `npm run lint`: passou com 9 avisos preexistentes e 0 erros.
- `npm run test`: 278 testes passaram; 12 suítes de integração falharam por `fetch failed` ao acessar o Supabase remoto disponível no ambiente, não por falha do módulo de e-mail.
