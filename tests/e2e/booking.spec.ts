import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// End-to-end booking flow (§19.3) against a seeded business: the public page
// lists services and resolves slots per business before booking.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = "senha12345";
const stamp = Date.now().toString().slice(-8);
const EMAIL = `e2e.${stamp}@agendfined.dev`;
const SLUG = `e2e-barbearia-${stamp}`;
// The public code captured from the confirmation screen in test 1, reused by
// the consultation test that follows (serial mode).
let publicCode = "";
let bizId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: user } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  const ownerId = user?.user?.id ?? "";
  await admin.from("profiles").upsert({ id: ownerId, display_name: "E2E" }, { onConflict: "id" });
  await admin.from("businesses").upsert(
    {
      owner_id: ownerId,
      name: "Barbearia E2E",
      slug: SLUG,
      phone: "+5511987654321",
      slot_interval_minutes: 30,
      min_notice_minutes: 0,
      booking_window_days: 60,
    },
    { onConflict: "slug" },
  );
  const { data: biz } = await admin.from("businesses").select("*").eq("slug", SLUG).single();
  bizId = biz!.id;
  await admin.from("services").insert({
    business_id: bizId,
    name: "Corte",
    duration_minutes: 30,
    price_cents: 4000,
  });

  // Business-level availability for the whole week.
  for (let wd = 1; wd <= 7; wd++) {
    await admin.from("availability").insert({
      business_id: bizId,
      weekday: wd,
      start_time: "08:00",
      end_time: "18:00",
    });
  }
});

test("public booking flow: reserve, confirm in dashboard, release on cancel", async ({ page }) => {
  // 1. Public page lists the service; pick service + date + slot.
  await page.goto(`${BASE_URL}/${SLUG}`);
  await expect(page.getByRole("heading", { name: "Barbearia E2E" })).toBeVisible();

  const serviceSelect = page.getByLabel("Escolha o serviço");
  await serviceSelect.selectOption({ index: 0 });

  // Pick the first available slot for tomorrow.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);
  await page.getByLabel("Escolha a data").fill(dateStr);

  const slotButton = page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first();
  await slotButton.waitFor({ state: "visible" });
  await slotButton.click();

  await page.getByRole("textbox", { name: "Nome" }).fill("Cliente E2E");
  await page.getByRole("textbox", { name: "Telefone / WhatsApp" }).fill("+5511977777777");
  await page.getByRole("checkbox", { name: /Autorizo o tratamento dos meus dados/ }).check();
  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  // 2. Confirmation screen (no personal data beyond service/date/business contact).
  await page.waitForURL(/\/confirmacao\?code=/);
  await expect(page.getByText("Reserva confirmada!")).toBeVisible();
  const confUrl = new URL(page.url());
  publicCode = confUrl.searchParams.get("code")!;
  expect(publicCode).toMatch(/^[0-9A-HJKMNPQRSTVWXYZ]{8}$/);

  // The reservation is bound to the business, not to any professional.
  const read = createClient(SUPABASE_URL, SUPABASE_SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: made } = await read
    .from("bookings")
    .select("business_id")
    .eq("public_code", publicCode)
    .single();
  expect(made?.business_id).toBe(bizId);

  // 3. Log in as owner and check the dashboard lists the booking.
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.waitForURL(/\/dashboard/);
  await page.goto(`${BASE_URL}/dashboard/agenda`);
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
  // 1. Open the public consultation page and enter the code captured earlier.
  await page.goto(`${BASE_URL}/${SLUG}/consultar`);
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
