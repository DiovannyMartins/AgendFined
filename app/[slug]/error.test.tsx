import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicPageError from "./error";

// #197: uma falha do banco na página pública nunca diz que a página não existe
// e fica no segmento, sem trocar o layout inteiro pelo global-error.
describe("PublicPageError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("offers a retry after a temporary failure", () => {
    const retry = vi.fn();
    render(<PublicPageError error={new Error("PUBLIC_BUSINESS_LOOKUP_FAILED")} retry={retry} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Não foi possível carregar os horários agora");
    expect(screen.queryByText(/404|não encontrada|não existe/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it("logs only the digest, as in production", () => {
    const redacted = Object.assign(new Error("redacted"), { digest: "123456" });

    render(<PublicPageError error={redacted} retry={() => {}} />);

    expect(console.error).toHaveBeenCalledWith("Falha ao carregar a página pública", "123456");
  });
});
