import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { APP_TIMEZONE } from "../../lib/app-timezone";
import { dateInTimeZone, decideRemoteWrites } from "../support/remote-write-guard";

// End-to-end booking flow (§19.3) against a seeded business: the public page
// lists services and resolves slots per business before booking.
//
// This spec WRITES to a real Supabase project. It only runs when
// ALLOW_REMOTE_E2E_WRITES=true and the project host is listed in
// E2E_ALLOWED_SUPABASE_HOSTS (see tests/support/remote-write-guard.ts).
// Every row it creates is tracked and removed in afterAll, even on failure.
// Run it with E2E_SERVER=dev: a production build enforces Turnstile
// (fail-closed) and local environments do not carry its keys.
const guard = decideRemoteWrites(process.env);
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${runId}-aA1!`;
// Synthetic, non-deliverable data only (example.com / reserved test numbers).
const EMAIL = `e2e.owner.${runId}@example.com`;
const CUSTOMER_EMAIL = `e2e.customer.${runId}@example.com`;
const SLUG = `e2e-barbearia-${runId}`;

// Everything created by this run; cleanup only touches these IDs.
const created: { userId?: string; businessId?: string } = {};
// The public code captured from the confirmation screen in test 1, reused by
// the consultation test that follows (serial mode).
let publicCode = "";
let bizId = "";

let adminClient: SupabaseClient | undefined;
function admin(): SupabaseClient {
  if (!guard.allowed) throw new Error(guard.reason);
  adminClient ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

function must<T>(step: string, result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(`Seed E2E falhou em ${step}: ${result.error.message}`);
  if (result.data === null || result.data === undefined) throw new Error(`Seed E2E falhou em ${step}: sem dados.`);
  return result.data;
}

test.describe.configure({ mode: "serial" });
test.skip(!guard.allowed, guard.allowed ? "" : guard.reason);

test.beforeAll(async () => {
  const db = admin();
  const createdUser = await db.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createdUser.error || !createdUser.data.user) {
    throw new Error(`Seed E2E falhou em createUser: ${createdUser.error?.message ?? "usuário não retornado"}`);
  }
  const user = createdUser.data;
  const ownerId = user.user.id;
  created.userId = ownerId;

  const profile = await db.from("profiles").upsert({ id: ownerId, display_name: "E2E" }, { onConflict: "id" });
  if (profile.error) throw new Error(`Seed E2E falhou em profiles: ${profile.error.message}`);

  const biz = must("businesses", await db
    .from("businesses")
    .insert({
      owner_id: ownerId,
      name: "Barbearia E2E",
      slug: SLUG,
      phone: "+5511900000000",
      slot_interval_minutes: 30,
      min_notice_minutes: 0,
      booking_window_days: 60,
    })
    .select("id")
    .single());
  bizId = biz.id as string;
  created.businessId = bizId;

  must("services", await db
    .from("services")
    .insert({ business_id: bizId, name: "Corte", duration_minutes: 30, price_cents: 4000 })
    .select("id")
    .single());

  // Business-level availability for the whole week.
  const availability = await db.from("availability").insert(
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      business_id: bizId,
      weekday,
      start_time: "08:00",
      end_time: "18:00",
    })),
  );
  if (availability.error) throw new Error(`Seed E2E falhou em availability: ${availability.error.message}`);
});

test.afterAll(async () => {
  if (!guard.allowed) return;
  const db = admin();
  const failures: string[] = [];
  try {
    if (created.businessId) {
      // Children first (bookings reference services/customers without cascade),
      // then the business; each delete is scoped to this run's business ID.
      for (const table of ["bookings", "waitlist_entries", "customers", "availability_blocks", "availability", "services", "billing_attempts", "subscriptions"]) {
        const { error } = await db.from(table).delete().eq("business_id", created.businessId);
        // A table missing from this schema version is not a leftover.
        if (error && !/does not exist|schema cache/i.test(error.message)) failures.push(`${table}: ${error.message}`);
      }
      const { error } = await db.from("businesses").delete().eq("id", created.businessId);
      if (error) failures.push(`businesses: ${error.message}`);
    }
  } finally {
    if (created.userId) {
      // Deleting the Auth user cascades to profiles and anything still left.
      const { error } = await db.auth.admin.deleteUser(created.userId);
      if (error) failures.push(`auth user: ${error.message}`);
    }
  }
  if (created.businessId) {
    const { count } = await db.from("businesses").select("id", { count: "exact", head: true }).eq("id", created.businessId);
    if (count) failures.push("business still present after cleanup");
  }
  if (failures.length) throw new Error(`Limpeza E2E incompleta: ${failures.join("; ")}`);
});

test("public booking flow: reserve, confirm in dashboard, release on cancel", async ({ page }) => {
  // 1. Public page lists the service; pick service + date + slot.
  await page.goto(`/${SLUG}`);
  await expect(page.getByRole("heading", { name: "Barbearia E2E" })).toBeVisible();

  const serviceSelect = page.getByLabel("Escolha o serviço");
  await serviceSelect.selectOption({ index: 0 });

  // Pick the first available slot for tomorrow in the app time zone, so the
  // date does not depend on the machine's local zone or UTC offset.
  const dateStr = dateInTimeZone(APP_TIMEZONE, 1);
  await page.getByLabel("Escolha a data").fill(dateStr);

  const slotButton = page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first();
  await slotButton.waitFor({ state: "visible" });
  await slotButton.click();

  await page.getByRole("textbox", { name: "Nome" }).fill("Cliente E2E");
  await page.getByRole("textbox", { name: "Telefone / WhatsApp" }).fill("+5511900000001");
  await page.getByRole("textbox", { name: "E-mail para confirmação" }).fill(CUSTOMER_EMAIL);
  await page.getByRole("checkbox", { name: /Autorizo o tratamento dos meus dados/ }).check();
  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  // 2. Confirmation screen (no personal data beyond service/date/business contact).
  await page.waitForURL(/\/confirmacao\?code=/);
  await expect(page.getByText("Reserva confirmada!")).toBeVisible();
  const confUrl = new URL(page.url());
  publicCode = confUrl.searchParams.get("code") ?? "";
  expect(publicCode).toMatch(/^[0-9A-HJKMNPQRSTVWXYZ]{8}$/);
  expect(confUrl.searchParams.get("cancel")).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // The reservation is bound to the business, not to any professional.
  const { data: made, error: madeError } = await admin()
    .from("bookings")
    .select("business_id")
    .eq("public_code", publicCode)
    .single();
  expect(madeError).toBeNull();
  expect(made?.business_id).toBe(bizId);

  // 3. Log in as owner and check the dashboard lists the booking.
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.waitForURL(/\/dashboard/);
  await page.goto("/dashboard/agenda");
  // The agenda (INC-1) is date-filtered and defaults to today, so jump to the
  // reservation's date before asserting it is listed.
  await page.getByLabel("Data").fill(dateStr);
  await expect(page.getByText("Corte")).toBeVisible();

  // 4. Cancel the booking and confirm the slot is released.
  await page.getByRole("button", { name: "Cancelar" }).first().click();
  await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
  await expect(page.getByText("Cancelada")).toBeVisible();
});

test("public consultation shows the booking by code", async ({ page }) => {
  test.skip(!publicCode, "O teste anterior não produziu um código de reserva.");
  // 1. Open the public consultation page and enter the code captured earlier.
  await page.goto(`/${SLUG}/consultar`);
  await expect(page.getByRole("heading", { name: "Consultar reserva" })).toBeVisible();
  await page.getByLabel("Código da reserva").fill(publicCode);
  await page.getByRole("button", { name: "Consultar" }).click();

  // 2. The booking (service + business contact) is shown; no customer data.
  await expect(page.getByText("Reserva encontrada")).toBeVisible();
  await expect(page.getByText("Corte")).toBeVisible();
  await expect(page.getByText("Barbearia E2E")).toBeVisible();
  await expect(page.getByText("Cliente E2E")).toHaveCount(0);

  // 3. An invalid code surfaces a friendly error.
  await page.getByRole("button", { name: "Consultar outra reserva" }).click();
  await page.getByLabel("Código da reserva").fill("not-a-code");
  await page.getByRole("button", { name: "Consultar" }).click();
  await expect(page.getByText("Informe um código de reserva válido.")).toBeVisible();

  // 4. An unknown (but well-formed) code reports not found.
  await page.getByLabel("Código da reserva").fill("ZZZZZZZZ");
  await page.getByRole("button", { name: "Consultar" }).click();
  await expect(page.getByText("Nenhuma reserva encontrada com esse código.")).toBeVisible();
});
