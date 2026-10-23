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

  // #149: duração inválida ganha o mesmo destaque de Nome e Preço, e cada erro
  // é anunciado ao focar o campo.
  it("marca a duração inválida e liga cada erro ao seu campo", async () => {
    render(<ServiceForm />);
    fireEvent.click(screen.getByRole("button", { name: /Novo serviço/ }));

    const duration = await screen.findByRole("spinbutton", { name: "Duração (min)" });
    fireEvent.change(duration, { target: { value: "0" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Preço (R$)" }), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar serviço" }));

    expect(await screen.findByText("Informe uma duração entre 5 e 480 minutos.")).toBeInTheDocument();
    expect(duration).toHaveAttribute("aria-invalid", "true");
    expect(duration).toHaveAccessibleDescription("Informe uma duração entre 5 e 480 minutos.");

    const name = screen.getByRole("textbox", { name: "Nome" });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription(/nome/i);

    const price = screen.getByRole("textbox", { name: "Preço (R$)" });
    expect(price).toHaveAccessibleDescription(/Use vírgula para os centavos.*Informe um preço válido/);
  });
});
