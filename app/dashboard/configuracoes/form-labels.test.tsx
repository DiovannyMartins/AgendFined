import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AvailabilityForm, AvailabilityRow } from "./availability-form";
import { BusinessForm } from "./business-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/business/actions", () => ({ createBusiness: vi.fn(), updateBusiness: vi.fn() }));
vi.mock("@/lib/availability/actions", () => ({
  setAvailability: vi.fn(),
  updateAvailability: vi.fn(),
  deleteAvailability: vi.fn(),
}));

describe("rótulos acessíveis das configurações", () => {
  it("anuncia o campo de slug pelo rótulo visível", () => {
    render(<BusinessForm />);

    const slug = screen.getByRole("textbox", { name: "Endereço público (slug)" });
    expect(slug).toHaveAccessibleDescription(/Apenas minúsculas, números e hífen/);
  });

  it("agrupa os dias da nova faixa sob um rótulo", () => {
    render(<AvailabilityForm />);

    expect(screen.getByRole("group", { name: "Dias da semana" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Segunda" })).toBeChecked();
  });

  it("dá nome ao seletor de dia da semana ao editar uma faixa", () => {
    render(<AvailabilityRow id="faixa-1" weekday={3} startTime="08:00:00" endTime="18:00:00" />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByRole("combobox", { name: "Dia da semana" })).toBeInTheDocument();
  });
});
