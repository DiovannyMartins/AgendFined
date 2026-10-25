# 0011 — E-mail opcional na reserva pública e lembrete manual pelo WhatsApp

**Status:** aceito

A spec `003-email-confirmation-design` tornou o e-mail obrigatório na reserva pública para que todo cliente recebesse a confirmação por e-mail, com o link privado de cancelamento (ADR 0005), e o lembrete automático do PROFISSIONAL. A análise de beta de 24/10/2026 (#195) apontou dois problemas no público brasileiro: muitos clientes de barbearia e salão não querem ou não lembram o e-mail e desistem do formulário, e o canal que eles leem é o WhatsApp, não o e-mail.

O e-mail passa a ser opcional na página pública, como já era na reserva pelo painel (#193). O banco já aceitava `p_customer_email` nulo em `create_booking`, então não há migration. Sem e-mail, `createBooking` não tenta enviar nada e devolve `confirmationEmail: "none"`, que não é uma falha: a tela de confirmação, a única que tem o token bruto, pede para o cliente guardar o link e oferece copiá-lo ou mandá-lo para o próprio WhatsApp (`wa.me/?text=`, sem número, para o cliente escolher a conversa). A falha de envio (#187) ganhou as mesmas opções. O link guardado é o mesmo do e-mail, sem a marca do fragmento, e continua sendo a capability do ADR 0005.

O lembrete automático continua só por e-mail. O lembrete pelo WhatsApp é manual: na agenda, cada reserva confirmada que ainda não começou tem "Lembrar pelo WhatsApp", que abre a conversa com o celular do cliente e o texto pronto, enviado do WhatsApp do próprio dono. Vale nos dois planos, porque não é automático. No PROFISSIONAL, a agenda avisa quando o cliente não tem e-mail e por isso não recebe o lembrete automático. O evento `booking_complete` do Google Analytics passou a levar `with_email`, para medir quantos clientes ainda informam o e-mail.

## Alternativas consideradas

- **Manter o e-mail obrigatório e só medir:** rejeitado como único passo, porque a reserva pelo painel já mostrou que o fluxo sem e-mail funciona; a medição continua pelo `with_email`.
- **Lembrete automático pela API oficial do WhatsApp Business (ou um provedor):** adiado. Exige escolher o provedor, pagar por mensagem, aprovar o template e registrar o consentimento na política de privacidade. Quando vier, o lembrete manual da agenda continua útil para o Grátis.
- **SMS:** adiado pelos mesmos motivos de custo, e com leitura menor que o WhatsApp.
- **Reenviar o link depois por outro canal:** impossível sem guardar o token bruto, o que o ADR 0005 rejeita.

## Consequências

- Um cliente sem e-mail que fecha a tela sem guardar o link só cancela ou remarca falando com o negócio, como no #187.
- O texto do consentimento LGPD fala em "e-mail, se informado".
- O lembrete pelo WhatsApp não fica registrado: o dono pode mandá-lo mais de uma vez, e o sistema não sabe se foi enviado.

## Fontes

- Issue #195 (análise de beta de 24/10/2026); #187 e #193
- `lib/validation/schemas.ts` (`publicBookingSchema`)
- `lib/booking/actions.ts` (`createBooking`)
- `lib/bookings/private-confirmation.ts`, `app/[slug]/confirmacao/save-private-link.tsx`
- `lib/reminders/whatsapp.ts`, `app/dashboard/agenda/agenda-list.tsx`
