import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConfirmationError from "./error";
import { CONFIRMATION_RATE_LIMITED, ConfirmationLookupError } from "./confirmation-errors";

// #140: a consulta limitada ou indisponível nunca diz que a página não existe.
describe("ConfirmationError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("asks the customer to wait when the lookup was rate limited", () => {
    render(<ConfirmationError error={new ConfirmationLookupError("rate_limited")} retry={() => {}} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Muitas consultas seguidas");
    expect(screen.getByText(/Aguarde alguns minutos e recarregue\. Sua reserva não foi afetada\./)).toBeInTheDocument();
  });

  it("recognizes the rate limit by digest alone, as in production", () => {
    const redacted = Object.assign(new Error("redacted"), { digest: CONFIRMATION_RATE_LIMITED });

    render(<ConfirmationError error={redacted} retry={() => {}} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Muitas consultas seguidas");
  });

  it("offers a retry after a temporary failure", () => {
    const retry = vi.fn();
    render(<ConfirmationError error={new ConfirmationLookupError("unavailable")} retry={retry} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Não foi possível carregar sua reserva agora");
    expect(screen.getByText(/Sua reserva não foi afetada/)).toBeInTheDocument();
    expect(screen.queryByText(/404|não existe/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
