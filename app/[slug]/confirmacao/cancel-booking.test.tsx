import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cancelPublicBooking } from "@/lib/booking/actions";
import { CancelBooking } from "./cancel-booking";

vi.mock("@/lib/booking/actions", () => ({ cancelPublicBooking: vi.fn() }));

const PRIVATE_URL = `https://agenda.example/barbearia/confirmacao?code=65925DBB#cancel=${"A".repeat(43)}`;

describe("CancelBooking", () => {
  it("points to the link in the confirmação e-mail for a later cancellation", () => {
    render(<CancelBooking code="65925DBB" token={"A".repeat(43)} />);

    expect(screen.getByText(/use o link do e-mail de confirmação/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // #187: without the e-mail, this button is the cliente's only self-service way out.
  it("asks to keep the link or talk to the negócio when the confirmação e-mail was not sent", () => {
    render(<CancelBooking code="65925DBB" token={"A".repeat(43)} confirmationEmail="failed" privateUrl={PRIVATE_URL} />);

    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent("Não conseguimos enviar o e-mail de confirmação");
    expect(warning).toHaveTextContent("Guarde o link agora");
    expect(warning).toHaveTextContent("fale com o negócio");
    expect(screen.getByRole("button", { name: "Copiar link da reserva" })).toBeInTheDocument();
    expect(screen.queryByText(/use o link do e-mail/)).not.toBeInTheDocument();
  });

  // #195: sem e-mail não é falha, mas o link também só existe nesta tela.
  it("offers to copy the link or send it to the cliente's own WhatsApp when no e-mail was given", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CancelBooking code="65925DBB" token={"A".repeat(43)} confirmationEmail="none" privateUrl={PRIVATE_URL} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Guarde o link da sua reserva");
    const whatsapp = screen.getByRole("link", { name: "Enviar para o meu WhatsApp" });
    expect(whatsapp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(whatsapp.getAttribute("href") ?? "")).toContain(PRIVATE_URL);
    expect(decodeURIComponent(whatsapp.getAttribute("href") ?? "")).toContain("6592-5DBB");

    fireEvent.click(screen.getByRole("button", { name: "Copiar link da reserva" }));
    expect(writeText).toHaveBeenCalledWith(PRIVATE_URL);
    expect(await screen.findByRole("button", { name: "Link copiado!" })).toBeInTheDocument();
    expect(screen.queryByText(/use o link do e-mail/)).not.toBeInTheDocument();
  });

  it("keeps the typed reason when the cancellation fails (#148)", async () => {
    vi.mocked(cancelPublicBooking).mockResolvedValueOnce({ status: "error", code: "DB_ERROR", message: "Não foi possível cancelar." });
    render(<CancelBooking code="65925DBB" token={"A".repeat(43)} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar reserva" }));
    fireEvent.change(await screen.findByLabelText("Motivo (opcional)"), { target: { value: "Imprevisto" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível cancelar.");
    expect(screen.getByLabelText("Motivo (opcional)")).toHaveValue("Imprevisto");
    const formData = vi.mocked(cancelPublicBooking).mock.calls[0][1];
    expect(formData.get("code")).toBe("65925DBB");
    expect(formData.get("cancelReason")).toBe("Imprevisto");
  });
});
