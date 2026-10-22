import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBlock } from "@/lib/availability/actions";
import { BlockForm } from "./block-form";

vi.mock("@/lib/availability/actions", () => ({
  createBlock: vi.fn(),
  deleteBlock: vi.fn(),
}));

const mockedCreate = vi.mocked(createBlock);

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Início"), { target: { value: "2026-10-22T09:00" } });
  fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "2026-10-22T12:00" } });
  fireEvent.change(screen.getByLabelText("Motivo (opcional)"), { target: { value: "Dentista" } });
  fireEvent.click(screen.getByRole("button", { name: "Criar bloqueio" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("criação de bloqueio", () => {
  it("mantém início, fim e motivo depois de um conflito (#148)", async () => {
    mockedCreate.mockResolvedValueOnce({
      ok: false,
      code: "BOOKING_CONFLICT",
      message: "Já existe uma reserva neste período.",
    });
    render(<BlockForm />);

    fillAndSubmit();

    expect(await screen.findByText("Já existe uma reserva neste período.")).toBeInTheDocument();
    expect(screen.getByLabelText("Início")).toHaveValue("2026-10-22T09:00");
    expect(screen.getByLabelText("Fim")).toHaveValue("2026-10-22T12:00");
    expect(screen.getByLabelText("Motivo (opcional)")).toHaveValue("Dentista");
  });

  it("limpa os campos depois de criar o bloqueio", async () => {
    mockedCreate.mockResolvedValueOnce({ ok: true, data: undefined });
    render(<BlockForm />);

    fillAndSubmit();

    await vi.waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    const formData = mockedCreate.mock.calls[0][1];
    expect(formData.get("reason")).toBe("Dentista");
    await vi.waitFor(() => expect(screen.getByLabelText("Motivo (opcional)")).toHaveValue(""));
    expect(screen.getByLabelText("Início")).toHaveValue("");
  });
});
