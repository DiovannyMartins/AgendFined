import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConfirmationError from "./error";
import { CONFIRMATION_UNAVAILABLE, ConfirmationLookupError } from "./confirmation-errors";

// #140: uma consulta que falhou nunca diz que a página não existe. O limite de
// consultas é respondido pelo proxy com 429 (#179).
describe("ConfirmationError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("offers a retry after a temporary failure", () => {
    const retry = vi.fn();
    render(<ConfirmationError error={new ConfirmationLookupError()} retry={retry} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Não foi possível carregar sua reserva agora");
    expect(screen.getByText(/Sua reserva não foi afetada/)).toBeInTheDocument();
    expect(screen.queryByText(/404|não existe/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it("logs only the digest, as in production", () => {
    const redacted = Object.assign(new Error("redacted"), { digest: CONFIRMATION_UNAVAILABLE });

    render(<ConfirmationError error={redacted} retry={() => {}} />);

    expect(console.error).toHaveBeenCalledWith("Falha ao carregar a confirmação", CONFIRMATION_UNAVAILABLE);
  });
});
