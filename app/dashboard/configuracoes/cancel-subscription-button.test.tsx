import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cancelSubscription, refresh } = vi.hoisted(() => ({
  cancelSubscription: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/billing/actions", () => ({ cancelSubscription }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CancelSubscriptionButton } from "./cancel-subscription-button";

describe("CancelSubscriptionButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelSubscription.mockResolvedValue({ ok: true });
  });

  it("asks for confirmation, with the date the access lasts, before cancelling", async () => {
    render(<CancelSubscriptionButton activeUntil={{ date: "21/11/2026", atLeast: false }} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar assinatura" }));
    expect(cancelSubscription).not.toHaveBeenCalled();

    expect(await screen.findByText(/Seu acesso continua até 21\/11\/2026\./)).toBeInTheDocument();
    expect(screen.getByText(/As novas cobranças no Mercado Pago param\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    await waitFor(() => expect(cancelSubscription).toHaveBeenCalledOnce());
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("promises only the minimum when the paid period is not known yet", async () => {
    render(<CancelSubscriptionButton activeUntil={{ date: "29/10/2026", atLeast: true }} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar assinatura" }));

    expect(
      await screen.findByText(/continua até o fim do mês já pago, no mínimo até 29\/10\/2026\./),
    ).toBeInTheDocument();
  });

  it("keeps the assinatura when the dono backs out", async () => {
    render(<CancelSubscriptionButton activeUntil={{ date: "21/11/2026", atLeast: false }} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar assinatura" }));
    fireEvent.click(await screen.findByRole("button", { name: "Manter assinatura" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Confirmar cancelamento" })).not.toBeInTheDocument(),
    );
    expect(cancelSubscription).not.toHaveBeenCalled();
  });

  it("shows the provider error inside the dialog", async () => {
    cancelSubscription.mockResolvedValue({
      ok: false,
      code: "PROVIDER_ERROR",
      message: "Não foi possível cancelar a assinatura. Tente novamente.",
    });
    render(<CancelSubscriptionButton activeUntil={{ date: "21/11/2026", atLeast: false }} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar assinatura" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar cancelamento" }));

    expect(await screen.findByText("Não foi possível cancelar a assinatura. Tente novamente.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
