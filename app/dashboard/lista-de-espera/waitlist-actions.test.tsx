import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { ok: boolean; message?: string; publicCode?: string; cancellationUrl?: string };

const { notifyWaitlistEntry, convertWaitlistEntry } = vi.hoisted(() => ({
  notifyWaitlistEntry: vi.fn<(prev: Result, formData: FormData) => Promise<Result>>(),
  convertWaitlistEntry: vi.fn<(prev: Result, formData: FormData) => Promise<Result>>(),
}));
vi.mock("@/lib/waitlist/actions", () => ({ notifyWaitlistEntry, convertWaitlistEntry }));

import { WaitlistActions } from "./waitlist-actions";

describe("WaitlistActions", () => {
  beforeEach(() => {
    notifyWaitlistEntry.mockReset();
    convertWaitlistEntry.mockReset();
  });

  it("keeps the reserva code and private link after the entrada becomes converted", async () => {
    convertWaitlistEntry.mockResolvedValue({
      ok: true,
      publicCode: "58FTBJNV",
      cancellationUrl: "/barbearia-demo/confirmacao?code=58FTBJNV#cancel=token",
      message: "Confirmação enviada por e-mail para bruna@example.com.",
    });
    const { rerender } = render(<WaitlistActions id="entry-1" status="notified" />);

    fireEvent.click(screen.getByRole("button", { name: "Converter em reserva" }));
    expect(await screen.findByText("Reserva criada: 58FT-BJNV")).toBeInTheDocument();

    // revalidatePath re-renders the entrada as converted.
    rerender(<WaitlistActions id="entry-1" status="converted" />);

    expect(screen.getByText("Reserva criada: 58FT-BJNV")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir confirmação privada" })).toHaveAttribute(
      "href",
      "/barbearia-demo/confirmacao?code=58FTBJNV#cancel=token",
    );
    expect(screen.getByText("Confirmação enviada por e-mail para bruna@example.com.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Converter em reserva" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notificar" })).not.toBeInTheDocument();
  });

  it("replaces an old Converter error with the result of Notificar", async () => {
    convertWaitlistEntry.mockResolvedValue({
      ok: false,
      message: "Esse horário ainda está ocupado. Converta quando ele for liberado.",
    });
    notifyWaitlistEntry.mockResolvedValue({ ok: true, message: "Aviso enviado por e-mail para bruna@example.com." });
    render(<WaitlistActions id="entry-1" status="pending" />);

    fireEvent.click(screen.getByRole("button", { name: "Converter em reserva" }));
    expect(
      await screen.findByText("Esse horário ainda está ocupado. Converta quando ele for liberado."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Notificar" }));

    expect(await screen.findByText("Aviso enviado por e-mail para bruna@example.com.")).toBeInTheDocument();
    expect(
      screen.queryByText("Esse horário ainda está ocupado. Converta quando ele for liberado."),
    ).not.toBeInTheDocument();
    expect(notifyWaitlistEntry.mock.calls[0][1].get("id")).toBe("entry-1");
  });

  it("renders nothing for an entrada converted or cancelled before this visit", () => {
    const { container, rerender } = render(<WaitlistActions id="entry-1" status="converted" />);
    expect(container).toBeEmptyDOMElement();

    rerender(<WaitlistActions id="entry-1" status="cancelled" />);
    expect(container).toBeEmptyDOMElement();
  });
});
