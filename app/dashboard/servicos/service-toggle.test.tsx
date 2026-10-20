import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceToggle } from "./service-toggle";

vi.mock("@/lib/services/actions", () => ({ toggleService: vi.fn() }));

describe("ServiceToggle", () => {
  it("diz qual serviço o switch ativa", () => {
    render(<ServiceToggle id="svc-1" name="Corte" isActive />);

    expect(screen.getByRole("switch", { name: "Ativar Corte" })).toBeInTheDocument();
  });
});
