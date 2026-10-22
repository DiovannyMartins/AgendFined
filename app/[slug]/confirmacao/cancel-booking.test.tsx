import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cancelPublicBooking } from "@/lib/booking/actions";
import { CancelBooking } from "./cancel-booking";

vi.mock("@/lib/booking/actions", () => ({ cancelPublicBooking: vi.fn() }));

describe("CancelBooking", () => {
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
