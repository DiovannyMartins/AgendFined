import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgendaList } from "./agenda-list";

vi.mock("./status-action", () => ({ StatusAction: () => null }));

describe("AgendaList", () => {
  it("dá à busca um nome acessível que não depende do placeholder", () => {
    render(<AgendaList bookings={[]} timezone="America/Sao_Paulo" />);

    expect(screen.getByRole("searchbox", { name: "Buscar reservas" })).toBeInTheDocument();
  });
});
