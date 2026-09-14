# AgendFined

Plataforma SaaS de agendamento online para profissionais e pequenos negócios. O profissional configura seu negócio, serviços e disponibilidade; clientes reservam serviços pela página pública, sem precisar de conta.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06b6d4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3fcf8e?logo=supabase&logoColor=black)
![Vitest](https://img.shields.io/badge/Vitest-4-6e9f18?logo=vitest&logoColor=white)

## Índice

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Arquitetura e fluxo de dados](#arquitetura-e-fluxo-de-dados)
- [Executando localmente](#executando-localmente)
- [Testes, lint e typecheck](#testes-lint-e-typecheck)
- [Modelo de banco e migrations](#modelo-de-banco-e-migrations)
- [Configurando o Supabase](#configurando-o-supabase)
- [Variáveis de ambiente](#variveis-de-ambiente)
- [Principais decisões técnicas](#principais-decisoes-tecnicas)
- [Deploy](#deploy)
- [Estado](#estado)
- [Produção](#producao)

## Funcionalidades

- **Página pública por slug** (`/[slug]`): o cliente escolhe serviço, data e horário sem criar conta.
- **Disponibilidade inteligente**: janela futura, antecedência mínima e intervalo de slots configuráveis por negócio.
- **Validação server-side**: revalidação atômica da disponibilidade no servidor, protegida contra sobreposições.
- **Dashboard do profissional**: gerencie negócio, serviços, disponibilidade e reservas, com blocos/manutenções de agenda.
- **Fuso fixo America/Sao_Paulo**: datas armazenadas em UTC e exibidas no horário de Brasília.
- **Anti-bot**: gate de Cloudflare Turnstile no fluxo público de reserva.
- **Histórico estável**: snapshots de serviço (nome, preço, duração) preservam o histórico da reserva.
- **Plano PROFISSIONAL (R$ 19/mês, Mercado Pago)**: relatórios, lembretes automáticos, gestão da lista de espera e exportação da agenda (Google Calendar/.ics). O plano Grátis contém o núcleo completo de agendamento.

> Especificação de produto e implementação: `documento-projeto.md` (fonte de verdade do MVP).

## Stack

| Tecnologia | Uso |
| --- | --- |
| Next.js 16 (App Router) + React 19 + TypeScript | Aplicação, rotas, Server Actions |
| Tailwind CSS 4 | Estilos responsivos |
| shadcn/ui + Lucide | Componentes de interface e ícones |
| React Hook Form + Zod | Formulários e validação compartilhada |
| Supabase Auth | Autenticação do profissional |
| Supabase PostgreSQL | Persistência, constraints, RLS, RPCs |
| Vitest + Playwright | Testes unitários, integração e E2E |
| Vercel | Deploy e hospedagem |

## Arquitetura e fluxo de dados

```text
Navegador -> Next.js (UI)
              -> Server Action / Route Handler
                 -> Zod + regras de domínio
                    -> Supabase PostgreSQL / Auth
                       -> RLS + constraints + transação
```

- A interface nunca é a fonte final de verdade para disponibilidade.
- Toda mutação relevante é validada no servidor com Zod e regras de domínio.
- A criação da reserva é protegida no banco contra sobreposição (exclusion constraint), mesmo sob concorrência.
- A service role key existe apenas no servidor e nunca é exposta ao navegador.
- O fluxo público de reserva usa uma RPC (`create_booking`) server-only, que grava customer + booking atomicamente.
- A confirmação pública é mediada por `public_code`, nunca por dados do cliente.

## Executando localmente

```bash
npm install
npm run dev        # http://localhost:3000
```

Requer **Node 22+** (ver `.nvmrc`/`.node-version` e `engines`).

## Testes, lint e typecheck

```bash
npm run test        # unitários + integração (Vitest)
npm run test:e2e    # E2E (Playwright, chromium + mobile)
npm run lint
npm run typecheck
```

- **Unitários** (`lib/**`): algoritmo de disponibilidade, Zod schemas, transições de status.
- **Integração**: concorrência de reservas, RLS, snapshots, bloqueio vs reserva.
- **E2E**: fluxo público de reserva e redirecionamentos de auth.

## Modelo de banco e migrations

As migrations vivem em `supabase/migrations/` e são aplicadas em ordem, seguindo a especificação (§20.4) e refinamentos posteriores:

- **0001** — extensões (`btree_gist`, `pgcrypto`) e enum `booking_status`
- **0002** — `profiles` e `businesses`
- **0003** — `services`, `availability`, `availability_blocks`, `customers`, `bookings`
- **0004** — índices, CHECKs, UNIQUEs e a **exclusion constraint** anti-sobreposição
- **0005** — triggers de `updated_at` + RPC transacional `create_booking`
- **0006** — RLS e policies (§13.2)
- **0007–0016** — consulta pública por `public_code`, políticas de leitura pública, RPC `lookup` para `anon`, timezone do fluxo público, regras anti-sobreposição dos blocos, endurecimento de segurança da `create_booking`, `security invoker`, `search_path` dos triggers e revogação das RPCs públicas

Aplicar no Supabase:

```bash
npx supabase db push --linked
```

Gerar os tipos tipados:

```bash
supabase gen types typescript --db-url "<db-url>" --schema public > lib/supabase/database-types.ts
```

## Configurando o Supabase

1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. Em **Project Settings → API**, copie a URL e as chaves `sb_publishable_...` e `sb_secret_...`.
3. Em **Authentication → Sign In / Up → Email**, habilite/desabilite "Confirm email" conforme o ambiente.
4. Em **Authentication → URL Configuration**, defina Site URL (`http://localhost:3000` em dev) e adicione as Redirect URLs (`http://localhost:3000/**`, `http://localhost:3000/auth/callback`).

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

| Variável | Exposição | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client/Server | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client/Server | Chave publishable (`sb_publishable_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Somente Server | Operações públicas controladas (`sb_secret_...`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Client | Site key pública do Cloudflare Turnstile (`0x...`) |
| `TURNSTILE_SECRET_KEY` | Somente Server | Secret do Turnstile (`0x...`); ambas as chaves juntas ou nenhuma |
| `APP_URL` | Somente Server | URL base para redirects de e-mail (preferido) |
| `NEXT_PUBLIC_APP_URL` | Client/Server | Fallback; use `APP_URL` no servidor |

> A service role **nunca** deve aparecer no bundle do navegador, em variável `NEXT_PUBLIC_`, no repositório Git ou em logs públicos. O Turnstile é *fail-closed*: sem ambas as chaves o widget não renderiza e o gate de anti-bot fica desativado.

## Principais decisões técnicas

- **Fuso fixo America/Sao_Paulo**: datas gravadas em UTC, exibidas no horário de Brasília.
- **Snapshots de reserva**: nome/preço/duração do serviço são copiados no momento da reserva; alterações futuras não mudam o histórico.
- **Exclusion constraint** em `bookings` para impedir sobreposição sob concorrência.
- **Service role server-only** no fluxo público, com validação estrita antes da escrita.
- **Desativação em vez de exclusão** de serviços com histórico.

## Deploy

Ver documentação da [Vercel](https://vercel.com/docs). Configure as variáveis de ambiente na Vercel (sem a service role no bundle) e adicione a URL de produção na config do Supabase.

## Estado

MVP completo (Fases 1–9 da spec).

## Produção

- **URL**: `https://agendfined.vercel.app`
- **Supabase**: projeto `<project-ref>` (produção) — manter em config privada, não no repositório
