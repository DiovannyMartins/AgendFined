import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SuspendedPrompt } from "./suspended-prompt";

describe("SuspendedPrompt (ADR 0013)", () => {
  it("explains the suspension and links to the Plano section", () => {
    render(<SuspendedPrompt />);

    expect(screen.getByRole("heading", { name: "Seu negócio está suspenso" })).toBeInTheDocument();
    expect(screen.getByText(/Seus dados continuam guardados/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assinar" })).toHaveAttribute("href", "/dashboard/configuracoes#plano");
  });

  it("compact notice keeps the message and CTA without a page-level heading", () => {
    render(<SuspendedPrompt compact title="Exportação indisponível" description="Assine para exportar." />);

    expect(screen.getByText("Exportação indisponível")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assinar" })).toBeInTheDocument();
  });
});
