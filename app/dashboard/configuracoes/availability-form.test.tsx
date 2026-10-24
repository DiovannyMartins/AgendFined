import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAvailability, setAvailability, updateAvailability } from "@/lib/availability/actions";
import { AvailabilityChangeNotice, AvailabilityChangeProvider, AvailabilityForm, AvailabilityRow } from "./availability-form";

vi.mock("@/lib/availability/actions", () => ({
  setAvailability: vi.fn(),
  updateAvailability: vi.fn(),
  deleteAvailability: vi.fn(),
}));

const mockedDelete = vi.mocked(deleteAvailability);
const mockedSet = vi.mocked(setAvailability);
const mockedUpdate = vi.mocked(updateAvailability);
const OVERLAP = { ok: false, code: "OVERLAP", message: "Este intervalo se sobrepõe a um já existente neste dia." } as const;

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

// React 19 resets uncontrolled fields after every <form action> submission;
// on error the owner must still see what was sent (#148).
describe("faixa com erro mantém o que foi digitado", () => {
  it("nova faixa mantém início e fim depois de um erro de sobreposição", async () => {
    mockedSet.mockResolvedValueOnce(OVERLAP);
    render(<AvailabilityForm />);

    fireEvent.change(screen.getByLabelText("Início"), { target: { value: "12:00" } });
    fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "13:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar faixa" }));

    expect(await screen.findByText(OVERLAP.message)).toBeInTheDocument();
    expect(screen.getByLabelText("Início")).toHaveValue("12:00");
    expect(screen.getByLabelText("Fim")).toHaveValue("13:00");
    const formData = mockedSet.mock.calls[0][1];
    expect(formData.get("startTime")).toBe("12:00");
    expect(formData.get("endTime")).toBe("13:00");
  });

  it("nova faixa volta ao padrão depois de adicionar com sucesso", async () => {
    mockedSet.mockResolvedValueOnce({ ok: true, data: undefined });
    render(<AvailabilityForm />);

    fireEvent.change(screen.getByLabelText("Início"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar faixa" }));

    await vi.waitFor(() => expect(mockedSet).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(screen.getByLabelText("Início")).toHaveValue("08:00"));
  });
});

describe("faixa em vários dias (#149)", () => {
  it("envia segunda a sexta de uma vez com o atalho", async () => {
    mockedSet.mockResolvedValueOnce({ ok: true, data: undefined });
    render(<AvailabilityForm />);

    fireEvent.click(screen.getByRole("button", { name: "Marcar segunda a sexta" }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar faixa em 5 dias" }));

    await vi.waitFor(() => expect(mockedSet).toHaveBeenCalledTimes(1));
    expect(mockedSet.mock.calls[0][1].getAll("weekday")).toEqual(["2", "3", "4", "5", "6"]);
  });

  it("desabilita o envio sem nenhum dia marcado", () => {
    render(<AvailabilityForm />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Segunda" }));

    expect(screen.getByRole("button", { name: "Adicionar faixa" })).toBeDisabled();
  });

  it("edição mantém os novos horários depois de um erro", async () => {
    mockedUpdate.mockResolvedValueOnce(OVERLAP);
    renderRow();

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Início"), { target: { value: "07:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(OVERLAP.message)).toBeInTheDocument();
    expect(screen.getByLabelText("Início")).toHaveValue("07:00");
  });
});

// #192: a mudança é salva, mas o dono fica sabendo das reservas que ficaram de fora.
describe("aviso de reservas fora do novo horário", () => {
  const WARNING = {
    warning: "Você ainda tem 1 reserva fora do novo horário: Ana (26/10/2026 às 10:00). Ela continua valendo; se precisar, cancele ou remarque pela agenda.",
    agendaDate: "2026-10-26",
  };

  function withNotice(row: ReactNode) {
    return (
      <AvailabilityChangeProvider>
        <AvailabilityChangeNotice />
        {row}
      </AvailabilityChangeProvider>
    );
  }

  it("mostra o aviso depois de remover a faixa, mesmo quando a linha some", async () => {
    mockedDelete.mockResolvedValueOnce({ ok: true, data: WARNING });
    const { rerender } = render(withNotice(<AvailabilityRow id="faixa-1" weekday={2} startTime="08:00:00" endTime="12:00:00" />));

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remover faixa" }));
    await vi.waitFor(() => expect(mockedDelete).toHaveBeenCalledTimes(1));
    // revalidatePath tira a linha removida da lista.
    rerender(withNotice(null));

    expect(await screen.findByText(WARNING.warning)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver na agenda" })).toHaveAttribute(
      "href",
      "/dashboard/agenda?data=2026-10-26&status=confirmed",
    );
  });

  it("mostra o aviso depois de editar a faixa", async () => {
    mockedUpdate.mockResolvedValueOnce({ ok: true, data: WARNING });
    render(withNotice(<AvailabilityRow id="faixa-1" weekday={2} startTime="08:00:00" endTime="12:00:00" />));

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(WARNING.warning)).toBeInTheDocument();
  });

  it("não mostra aviso quando nenhuma reserva ficou de fora", async () => {
    mockedDelete.mockResolvedValueOnce({ ok: true, data: undefined });
    render(withNotice(<AvailabilityRow id="faixa-1" weekday={2} startTime="08:00:00" endTime="12:00:00" />));

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remover faixa" }));
    await vi.waitFor(() => expect(mockedDelete).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
