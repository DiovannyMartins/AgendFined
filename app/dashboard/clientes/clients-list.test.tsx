import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClientsList } from "./clients-list";

vi.mock("@/lib/customers/search", () => ({ semanticSearchCustomers: vi.fn() }));

describe("ClientsList", () => {
  it("dá à busca um nome acessível que não depende do placeholder", () => {
    render(<ClientsList history={[]} timezone="America/Sao_Paulo" />);

    expect(screen.getByRole("searchbox", { name: "Buscar clientes" })).toBeInTheDocument();
  });
});
