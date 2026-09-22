import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UpgradePrompt } from "./upgrade-prompt";

describe("UpgradePrompt (ADR 0008)", () => {
  it("renders the Pro-feature upgrade message and its CTA", () => {
    render(
      <UpgradePrompt
        title="Relatórios é um recurso PROFISSIONAL"
        description="Assine o PROFISSIONAL para ver faturamento."
        ctaLabel="Ver planos"
      />,
    );

    expect(screen.getByText("Relatórios é um recurso PROFISSIONAL")).toBeInTheDocument();
    expect(screen.getByText("Assine o PROFISSIONAL para ver faturamento.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver planos" })).toHaveAttribute(
      "href",
      "/dashboard/configuracoes#plano",
    );
  });
});
