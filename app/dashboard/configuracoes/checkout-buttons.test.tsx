import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { retryUpgrade, startUpgrade } from "@/lib/billing/actions";
import { navigateToCheckout } from "@/lib/billing/checkout-navigation";
import { UpgradeButton } from "./upgrade-button";
import { RetryUpgradeButton } from "./retry-upgrade-button";

vi.mock("@/lib/billing/actions", () => ({
  retryUpgrade: vi.fn(),
  startUpgrade: vi.fn(),
}));
vi.mock("@/lib/billing/checkout-navigation", () => ({
  navigateToCheckout: vi.fn(),
}));

const mockedStartUpgrade = vi.mocked(startUpgrade);
const mockedRetryUpgrade = vi.mocked(retryUpgrade);
const mockedNavigateToCheckout = vi.mocked(navigateToCheckout);

describe("checkout buttons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navega o Fazer upgrade na mesma aba", async () => {
    mockedStartUpgrade.mockResolvedValue({ ok: true, initPoint: "https://mp.example/upgrade" });
    const open = vi.spyOn(window, "open");

    render(<UpgradeButton />);
    fireEvent.click(screen.getByRole("button", { name: "Fazer upgrade" }));

    await waitFor(() => {
      expect(mockedStartUpgrade).toHaveBeenCalledOnce();
      expect(mockedNavigateToCheckout).toHaveBeenCalledWith("https://mp.example/upgrade");
    });
    expect(open).not.toHaveBeenCalled();
  });

  it("navega o retry na mesma aba", async () => {
    mockedRetryUpgrade.mockResolvedValue({ ok: true, initPoint: "https://mp.example/retry" });
    const open = vi.spyOn(window, "open");

    render(<RetryUpgradeButton />);
    fireEvent.click(screen.getByRole("button", { name: "Concluir pagamento" }));

    await waitFor(() => {
      expect(mockedRetryUpgrade).toHaveBeenCalledOnce();
      expect(mockedNavigateToCheckout).toHaveBeenCalledWith("https://mp.example/retry");
    });
    expect(open).not.toHaveBeenCalled();
  });
});
