import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BusinessPhone } from "./business-contact";

describe("BusinessPhone (#149)", () => {
  it("liga para o celular e oferece o WhatsApp", () => {
    render(<BusinessPhone phone="51998765432" />);

    expect(screen.getByRole("link", { name: "(51) 99876-5432" })).toHaveAttribute("href", "tel:+5551998765432");
    expect(screen.getByRole("link", { name: "Chamar no WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5551998765432",
    );
  });

  it("não oferece WhatsApp para telefone fixo", () => {
    render(<BusinessPhone phone="1133334444" />);

    expect(screen.getByRole("link", { name: "(11) 3333-4444" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Chamar no WhatsApp" })).not.toBeInTheDocument();
  });

  it("mostra como texto um telefone que não é brasileiro", () => {
    render(<BusinessPhone phone="+1 415 555 0100" />);

    expect(screen.getByText("+1 415 555 0100")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
