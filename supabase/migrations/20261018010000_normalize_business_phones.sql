-- Issue #114: o telefone do negócio passou a ser validado e gravado na mesma
-- forma canônica do telefone do cliente (`brazilianPhoneSchema` em
-- lib/validation/schemas.ts): só dígitos, DDD + número, sem o 55. Até aqui o
-- setup gravava o texto digitado ("(11) 3333-4444", "+5511999999999").
--
-- Esta migration normaliza os telefones já gravados em `businesses.phone`
-- com `private.normalize_customer_phone` (20261017030000), que espelha a mesma
-- regra. Telefones que não normalizam ficam como estão: as telas os mostram
-- como gravados e o dono precisa corrigi-los no próximo salvamento das
-- configurações. `bookings` não guarda o telefone do negócio, então nenhum
-- snapshot é afetado.
update public.businesses
set phone = private.normalize_customer_phone(phone)
where private.normalize_customer_phone(phone) is not null
  and phone <> private.normalize_customer_phone(phone);
