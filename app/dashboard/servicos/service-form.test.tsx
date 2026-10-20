import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceForm } from "./service-form";

vi.mock("@/lib/services/actions", () => ({ createService: vi.fn(), updateService: vi.fn() }));

describe("ServiceForm", () => {
  it("anuncia o campo de preço pelo rótulo visível", async () => {
    render(<ServiceForm />);
    fireEvent.click(screen.getByRole("button", { name: /Novo serviço/ }));

    expect(await screen.findByRole("textbox", { name: "Preço (R$)" })).toBeInTheDocument();
  });

  it("avisa o preço máximo no próprio campo", async () => {
    render(<ServiceForm />);
    fireEvent.click(screen.getByRole("button", { name: /Novo serviço/ }));

    fireEvent.change(await screen.findByRole("textbox", { name: "Nome" }), { target: { value: "Corte" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Preço (R$)" }), { target: { value: "99999999" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar serviço" }));

    expect(await screen.findByText("O preço máximo é R$ 100.000,00.")).toBeInTheDocument();
  });
});
