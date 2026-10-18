import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { DEMO_BUSINESS_ID, DEMO_SERVICE_IDS } from "./seed-demo-ids.mjs";

try {
  loadEnvFile(".env.local");
} catch (error) {
  throw new Error(`Não foi possível carregar .env.local: ${error instanceof Error ? error.message : String(error)}`);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL não está definida em .env.local.");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY não está definida em .env.local.");

let parsedUrl;
try {
  parsedUrl = new URL(supabaseUrl);
} catch {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL não é uma URL válida.");
}

if (
  parsedUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(parsedUrl.hostname) ||
  parsedUrl.port !== "54321"
) {
  throw new Error("Este bootstrap é somente para o Supabase local em http://127.0.0.1:54321.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO_EMAIL = "demo.local@agendfined.invalid";
const DEMO_PASSWORD = process.env.LOCAL_DEMO_PASSWORD;
if (!DEMO_PASSWORD) throw new Error("LOCAL_DEMO_PASSWORD não está definida em .env.local.");
const DEMO_PROFILE_NAME = "Demo Barber";
const DEMO_BUSINESS_SLUG = "barbearia-demo";

async function findDemoUser() {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Falha ao procurar usuário demo: ${error.message}`);
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === DEMO_EMAIL);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}

async function main() {
  let user = await findDemoUser();
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`Falha ao criar usuário demo: ${error.message}`);
    if (!data.user) throw new Error("A criação do usuário demo não retornou um usuário.");
    user = data.user;
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    { id: user.id, display_name: DEMO_PROFILE_NAME },
    { onConflict: "id" },
  );
  if (profileError) throw new Error(`Falha ao criar/atualizar profile demo: ${profileError.message}`);

  const { data: existingBusiness, error: businessLookupError } = await admin
    .from("businesses")
    .select("id, owner_id")
    .eq("id", DEMO_BUSINESS_ID)
    .maybeSingle();
  if (businessLookupError) throw new Error(`Falha ao procurar negócio demo: ${businessLookupError.message}`);
  if (existingBusiness && existingBusiness.owner_id !== user.id) {
    throw new Error("O negócio demo existente pertence a outro usuário; nenhuma reassociação foi feita.");
  }

  // Bancos semeados antes da troca para UUIDs válidos têm o negócio demo com o
  // ID antigo; owner_id e slug são únicos, então o upsert abaixo falharia.
  const { data: ownedBusiness, error: ownedLookupError } = await admin
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (ownedLookupError) throw new Error(`Falha ao procurar negócio do usuário demo: ${ownedLookupError.message}`);
  if (ownedBusiness && ownedBusiness.id !== DEMO_BUSINESS_ID) {
    throw new Error(
      `O usuário demo já tem um negócio com outro ID (${ownedBusiness.id}), provavelmente de um seed antigo. ` +
        "Rode `npx supabase db reset` e depois `npm run seed:local`.",
    );
  }

  const { error: businessError } = await admin.from("businesses").upsert(
    {
      id: DEMO_BUSINESS_ID,
      owner_id: user.id,
      name: "Barbearia Demo",
      slug: DEMO_BUSINESS_SLUG,
      phone: "+5511999999999",
    },
    { onConflict: "id" },
  );
  if (businessError) throw new Error(`Falha ao criar/atualizar negócio demo: ${businessError.message}`);

  const { error: servicesError } = await admin.from("services").upsert(
    [
      { id: DEMO_SERVICE_IDS[0], business_id: DEMO_BUSINESS_ID, name: "Corte", duration_minutes: 30, price_cents: 4000 },
      { id: DEMO_SERVICE_IDS[1], business_id: DEMO_BUSINESS_ID, name: "Barba", duration_minutes: 15, price_cents: 2000 },
    ],
    { onConflict: "id" },
  );
  if (servicesError) throw new Error(`Falha ao criar/atualizar serviços demo: ${servicesError.message}`);

  const { error: availabilityError } = await admin.from("availability").upsert(
    [
      { business_id: DEMO_BUSINESS_ID, weekday: 2, start_time: "08:00", end_time: "12:00" },
      { business_id: DEMO_BUSINESS_ID, weekday: 2, start_time: "14:00", end_time: "18:00" },
      { business_id: DEMO_BUSINESS_ID, weekday: 3, start_time: "08:00", end_time: "18:00" },
    ],
    { onConflict: "business_id,weekday,start_time" },
  );
  if (availabilityError) throw new Error(`Falha ao criar/atualizar disponibilidade demo: ${availabilityError.message}`);

  console.log(`Bootstrap local concluído para ${DEMO_EMAIL} (${user.id}).`);
}

main().catch((error) => {
  console.error(`Bootstrap local falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
