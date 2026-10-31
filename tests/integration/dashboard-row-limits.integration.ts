import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, anonClientForUser, retryOnFk } from "./index";
import { fetchAgendaWeek } from "@/lib/agenda/get-week";
import { getBillingReport } from "@/lib/reports/get-report";
import { toCustomerSummary } from "@/lib/customers/history";

// #215: PostgREST cuts every response at 1000 rows (max_rows). With more than
// 1000 reservas the agenda lost the future ones and the counts of Serviços,
// Relatórios and Clientes came out wrong. Here a business has 1100 past
// reservas and 3 future ones, and each screen's read boundary must still see
// all of them. RUN: npm run test:integration:local.
const stamp = Date.now().toString().slice(-8);
const EMAIL = `limite.${stamp}@agendfined.dev`;
const OUTSIDER_EMAIL = `limite-out.${stamp}@agendfined.dev`;
const PASSWORD = process.env.INTEGRATION_TEST_PASSWORD ?? `Test-${stamp}-aA1!`;
const TIMEZONE = "America/Sao_Paulo";

const PAST = 1100;
const PRICE = 4000;
// A Wednesday; its week is 2099-03-02 (Mon) .. 2099-03-08 (Sun).
const FUTURE_DAY = "2099-03-04";
const FUTURE = ["2099-03-02T13:00:00.000Z", "2099-03-04T13:00:00.000Z", "2099-03-08T13:00:00.000Z"];

let admin: ReturnType<typeof adminClient>;
let ownerId = "";
let outsiderId = "";
let businessId = "";
let serviceId = "";

function bookingRow(customerId: string, startAt: string, status: "completed" | "confirmed") {
  return {
    business_id: businessId,
    service_id: serviceId,
    customer_id: customerId,
    customer_name_snapshot: "Cliente Fiel",
    customer_phone_snapshot: "+5511990001234",
    customer_email_snapshot: "fiel@example.com",
    service_name_snapshot: "Corte",
    duration_minutes_snapshot: 30,
    price_cents_snapshot: PRICE,
    start_at: startAt,
    end_at: new Date(Date.parse(startAt) + 30 * 60_000).toISOString(),
    status,
  };
}

async function createOwner(email: string, name: string, slug: string, plan: "pro" | "free") {
  const { data: created } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const id = created?.user?.id ?? "";
  await admin.from("profiles").upsert({ id, display_name: name }, { onConflict: "id" });
  const bizId = await retryOnFk(async () => {
    const { data: biz, error } = await admin
      .from("businesses")
      .insert({
        owner_id: id,
        name,
        slug,
        phone: "+5511987650000",
        slot_interval_minutes: 30,
        min_notice_minutes: 0,
        booking_window_days: 60,
        timezone: TIMEZONE,
        plan,
      })
      .select("id")
      .single();
    if (error) throw new Error(`business insert: ${error.message}`);
    return biz!.id;
  });
  return { id, bizId };
}

beforeAll(async () => {
  admin = adminClient();

  const owner = await createOwner(EMAIL, "Agenda Cheia", `agenda-cheia-${stamp}`, "pro");
  ownerId = owner.id;
  businessId = owner.bizId;
  outsiderId = (await createOwner(OUTSIDER_EMAIL, "Alheia", `alheia-limite-${stamp}`, "pro")).id;

  const { data: svc } = await admin
    .from("services")
    .insert({ business_id: businessId, name: "Corte", duration_minutes: 30, price_cents: PRICE })
    .select("id")
    .single();
  serviceId = svc!.id;

  const { data: cust } = await admin
    .from("customers")
    .insert({ business_id: businessId, name: "Cliente Fiel", phone: "+5511990001234", email: "fiel@example.com" })
    .select("id")
    .single();
  const customerId = cust!.id;

  // One past reserva per hour from 2020-01-01: distinct slots, all completed.
  const base = Date.parse("2020-01-01T10:00:00.000Z");
  const past = Array.from({ length: PAST }, (_, i) =>
    bookingRow(customerId, new Date(base + i * 3_600_000).toISOString(), "completed"),
  );
  for (let i = 0; i < past.length; i += 500) {
    const { error } = await admin.from("bookings").insert(past.slice(i, i + 500));
    if (error) throw new Error(`past bookings: ${error.message}`);
  }
  const { error } = await admin.from("bookings").insert(FUTURE.map((at) => bookingRow(customerId, at, "confirmed")));
  if (error) throw new Error(`future bookings: ${error.message}`);
}, 120_000);

afterAll(async () => {
  await admin.from("businesses").delete().in("owner_id", [ownerId, outsiderId]);
  await admin.auth.admin.deleteUser(ownerId).catch(() => undefined);
  await admin.auth.admin.deleteUser(outsiderId).catch(() => undefined);
});

describe("#215 telas do painel acima de 1000 reservas", () => {
  it("a agenda mostra as reservas futuras da semana, só com as chaves da allowlist", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const week = await fetchAgendaWeek(owner, businessId, FUTURE_DAY, TIMEZONE);

    expect(week.days[0]).toBe("2099-03-02");
    expect(week.bookings.map((b) => b.start_at)).toEqual(FUTURE.map((at) => at.replace(".000Z", "+00:00")));
    for (const booking of week.bookings) {
      expect(booking.has_email).toBe(true);
      expect(booking).not.toHaveProperty("customer_email_snapshot");
      expect(booking).not.toHaveProperty("cancel_token_hash");
      expect(booking).not.toHaveProperty("reminder_claim_token");
    }
  });

  it("Serviços conta todas as reservas no banco", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { data, error } = await owner.rpc("service_booking_counts", { p_business_id: businessId });

    expect(error).toBeNull();
    expect(data).toEqual([{ service_id: serviceId, booking_count: PAST + FUTURE.length, scheduled_count: FUTURE.length }]);
  });

  it("Relatórios em \"Sempre\" agrega todas as reservas", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const result = await getBillingReport("all", {
      getBusiness: async () => ({ id: businessId, plan: "pro" }),
      fetchGroups: async (id, range) => {
        const { data, error } = await owner.rpc("billing_report_groups", {
          p_business_id: id,
          p_from: range.from,
          p_to: range.to,
        });
        if (error) throw new Error(error.message);
        return data ?? [];
      },
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.report.totalBookings).toBe(PAST + FUTURE.length);
    expect(result.report.completed).toBe(PAST);
    expect(result.report.confirmed).toBe(FUTURE.length);
    expect(result.report.revenueCents).toBe(PAST * PRICE);
    expect(result.report.topService).toEqual({ name: "Corte", count: PAST, revenueCents: PAST * PRICE });
  });

  it("Clientes conta as reservas de cada cliente no banco", async () => {
    const owner = await anonClientForUser(EMAIL, PASSWORD);
    const { data: customers } = await owner
      .from("customers")
      .select("id, name, phone, email")
      .eq("business_id", businessId);
    const { data: counts, error } = await owner.rpc("customer_booking_counts", {
      p_business_id: businessId,
      p_customer_ids: (customers ?? []).map((c) => c.id),
    });

    expect(error).toBeNull();
    expect((customers ?? []).map((c) => toCustomerSummary(c, Number(counts?.[0]?.booking_count)))).toEqual([
      expect.objectContaining({ name: "Cliente Fiel", booking_count: PAST + FUTURE.length }),
    ]);
  });

  it("as agregações respeitam o RLS e não abrem para anon", async () => {
    const outsider = await anonClientForUser(OUTSIDER_EMAIL, PASSWORD);
    const counts = await outsider.rpc("service_booking_counts", { p_business_id: businessId });
    expect(counts.error).toBeNull();
    expect(counts.data).toEqual([]);
    const groups = await outsider.rpc("billing_report_groups", {
      p_business_id: businessId,
      p_from: "0001-01-01T00:00:00.000Z",
      p_to: "9999-12-31T23:59:59.999Z",
    });
    expect(groups.data).toEqual([]);

    const anon = await anonClient().rpc("service_booking_counts", { p_business_id: businessId });
    expect(anon.error).not.toBeNull();
  });
});
