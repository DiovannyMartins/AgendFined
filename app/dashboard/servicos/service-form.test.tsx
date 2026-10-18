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
});
