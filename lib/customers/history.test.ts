import { describe, expect, it } from "vitest";
import {
  buildCustomerHistory,
  customerSearchFilter,
  toCustomerSummary,
  filterCustomers,
  searchCustomerHistory,
  type CustomerRow,
} from "@/lib/customers/history";

const eli: CustomerRow = { id: "c1", name: "Eli", phone: "+5511900000001", email: "eli@ex.com" };
const ana: CustomerRow = { id: "c2", name: "Ana", phone: "+5511900000002", email: null };

describe("buildCustomerHistory", () => {
  it("groups each customer's bookings and sorts them newest-first", () => {
    const bookings = [
      { id: "b1", customer_id: "c1", start_at: "2026-09-01T10:00:00Z", status: "completed" as const, service_name_snapshot: "Corte", duration_minutes_snapshot: 30 },
      { id: "b2", customer_id: "c1", start_at: "2026-09-05T10:00:00Z", status: "confirmed" as const, service_name_snapshot: "Barba", duration_minutes_snapshot: 15 },
      { id: "b3", customer_id: "c2", start_at: "2026-08-20T10:00:00Z", status: "cancelled" as const, service_name_snapshot: "Sobrancelha", duration_minutes_snapshot: 20 },
    ];

    const history = buildCustomerHistory([eli, ana], bookings);
    expect(history).toHaveLength(2);

    const eliEntry = history.find((h) => h.customer.id === "c1")!;
    expect(eliEntry.bookings.map((b) => b.id)).toEqual(["b2", "b1"]);

    const anaEntry = history.find((h) => h.customer.id === "c2")!;
    expect(anaEntry.bookings.map((b) => b.id)).toEqual(["b3"]);
  });

  it("a customer with no bookings still appears, with an empty history", () => {
    const history = buildCustomerHistory([eli], []);
    expect(history).toEqual([{ customer: eli, bookings: [] }]);
  });
});

describe("filterCustomers", () => {
  it("matches by name, phone or email, case-insensitively", () => {
    expect(filterCustomers([eli, ana], "eli").map((c) => c.id)).toEqual(["c1"]);
    expect(filterCustomers([eli, ana], "0000001").map((c) => c.id)).toEqual(["c1"]);
    expect(filterCustomers([eli, ana], "EX.COM").map((c) => c.id)).toEqual(["c1"]);
    expect(filterCustomers([eli, ana], "ana").map((c) => c.id)).toEqual(["c2"]);
  });

  it("an empty query returns every customer", () => {
    expect(filterCustomers([eli, ana], "")).toEqual([eli, ana]);
    expect(filterCustomers([eli, ana], "   ")).toEqual([eli, ana]);
  });

  it("no match returns an empty list", () => {
    expect(filterCustomers([eli, ana], "zed")).toEqual([]);
  });
});

describe("searchCustomerHistory", () => {
  const joao: CustomerRow = { id: "c3", name: "João Reteste", phone: "+5511988887777", email: "joao@ex.com" };
  const beta: CustomerRow = { id: "c4", name: "Cliente Beta", phone: "11977776666", email: "qa.beta@ex.com" };
  const gama: CustomerRow = { id: "c5", name: "Cliente Gama", phone: "21966665555", email: null };
  const delta: CustomerRow = { id: "c6", name: "Delta Beta", phone: "21955554444", email: null };
  const bookings = [
    { id: "b1", customer_id: "c3", start_at: "2026-09-01T10:00:00Z", status: "completed" as const, service_name_snapshot: "Corte", duration_minutes_snapshot: 30 },
    { id: "b2", customer_id: "c5", start_at: "2026-09-02T10:00:00Z", status: "confirmed" as const, service_name_snapshot: "Barba", duration_minutes_snapshot: 15 },
  ];
  const history = buildCustomerHistory([joao, beta, gama, delta], bookings);
  const ids = (query: string) => searchCustomerHistory(history, query)?.map((h) => h.customer.id);

  it("a phone typed as the list shows it finds only that customer", () => {
    expect(ids("(11) 98888-7777")).toEqual(["c3"]);
    expect(ids("98888-7777")).toEqual(["c3"]);
    expect(ids("98888")).toEqual(["c3"]);
  });

  it("a multi-word query requires every word to match", () => {
    expect(ids("Cliente Beta")).toEqual(["c4"]);
    expect(ids("joão corte")).toEqual(["c3"]);
    expect(ids("joão barba")).toEqual([]);
  });

  it("single-word searches by name, email and booking history keep working", () => {
    expect(ids("joão")).toEqual(["c3"]);
    expect(ids("JOAO")).toEqual(["c3"]);
    expect(ids("qa.beta@")).toEqual(["c4"]);
    expect(ids("barba")).toEqual(["c5"]);
  });

  it("a query without usable words is not searched (null)", () => {
    expect(searchCustomerHistory(history, "a")).toBeNull();
    expect(searchCustomerHistory(history, "   ")).toBeNull();
  });
});

describe("allowlist das props do ClientsList (#215)", () => {
  const row = {
    id: "c1",
    business_id: "biz",
    name: "Eli",
    phone: "+5511900000001",
    email: "eli@ex.com",
    notes: "nota interna",
    created_at: "2026-01-01T00:00:00Z",
  };

  it("toCustomerSummary passa só as chaves da allowlist", () => {
    const summary = toCustomerSummary(row, 1200);
    expect(Object.keys(summary).sort()).toEqual(["booking_count", "email", "id", "name", "phone"]);
    expect(summary.booking_count).toBe(1200);
  });

  it("buildCustomerHistory cria objetos novos, sem tokens das reservas", () => {
    const booking = {
      id: "b1",
      customer_id: "c1",
      start_at: "2026-09-01T10:00:00Z",
      status: "completed" as const,
      service_name_snapshot: "Corte",
      duration_minutes_snapshot: 30,
      cancel_token_hash: "c".repeat(64),
      reminder_claim_token: "token",
    };
    const [entry] = buildCustomerHistory([row], [booking]);

    expect(entry.customer).not.toBe(row);
    expect(Object.keys(entry.customer).sort()).toEqual(["email", "id", "name", "phone"]);
    expect(Object.keys(entry.bookings[0]).sort()).toEqual([
      "customer_id",
      "duration_minutes_snapshot",
      "id",
      "service_name_snapshot",
      "start_at",
      "status",
    ]);
  });
});

describe("customerSearchFilter", () => {
  it("busca nome, e-mail e os dígitos do telefone", () => {
    expect(customerSearchFilter("  (11) 98888 ")).toBe("name.ilike.*11 98888*,email.ilike.*11 98888*,phone.ilike.*1198888*");
    expect(customerSearchFilter("Ana")).toBe("name.ilike.*Ana*,email.ilike.*Ana*");
  });

  it("descarta a sintaxe de filtro do PostgREST", () => {
    expect(customerSearchFilter("a,id.eq.1)")).toBe("name.ilike.*a id.eq.1*,email.ilike.*a id.eq.1*");
    expect(customerSearchFilter("*%(),\"")).toBeNull();
  });
});
