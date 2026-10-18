import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAvailability } from "@/lib/availability/actions";
import { AvailabilityRow } from "./availability-form";

vi.mock("@/lib/availability/actions", () => ({
  setAvailability: vi.fn(),
  updateAvailability: vi.fn(),
  deleteAvailability: vi.fn(),
}));

const mockedDelete = vi.mocked(deleteAvailability);

function renderRow() {
  render(<AvailabilityRow id="faixa-1" weekday={3} startTime="08:00:00" endTime="12:30:00" />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("remoção de faixa de disponibilidade", () => {
  it("pede confirmação mostrando o dia e o horário antes de remover", async () => {
    renderRow();

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Terça, 08:00 – 12:30");
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("não remove quando o dono cancela", async () => {
    renderRow();

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("remove a faixa depois da confirmação", async () => {
    mockedDelete.mockResolvedValueOnce({ ok: true, data: undefined });
    renderRow();

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remover faixa" }));

    await vi.waitFor(() => expect(mockedDelete).toHaveBeenCalledWith("faixa-1"));
  });

  it("mostra o erro e libera o botão quando a remoção falha", async () => {
    mockedDelete.mockResolvedValueOnce({ ok: false, code: "DB_ERROR", message: "Não foi possível excluir o horário." });
    renderRow();

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remover faixa" }));

    expect(await screen.findByText("Não foi possível excluir o horário.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Remover faixa" })).toBeEnabled();
  });

  it("mostra um erro genérico quando a chamada da remoção falha", async () => {
    mockedDelete.mockRejectedValueOnce(new Error("network"));
    renderRow();

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remover faixa" }));

    expect(await screen.findByText("Não foi possível remover a faixa. Tente novamente.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Remover faixa" })).toBeEnabled();
  });
});
