import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateCancellation } from "./private-cancellation";

vi.mock("./cancel-booking", () => ({
  CancelBooking: ({ code, token, confirmationEmailSent = true }: { code: string; token: string; confirmationEmailSent?: boolean }) => (
    <div data-testid="private-cancellation">{`${code}:${token}:${confirmationEmailSent ? "email" : "sem-email"}`}</div>
  ),
}));

const TOKEN = "A".repeat(43);

describe("PrivateCancellation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", `/barbearia/confirmacao?code=65925DBB#cancel=${TOKEN}`);
  });

  it("captures the fragment capability and immediately scrubs it from the URL", async () => {
    render(<PrivateCancellation code="65925DBB" canCancel onCancelled={() => {}} />);

    expect(await screen.findByTestId("private-cancellation")).toHaveTextContent(
      `65925DBB:${TOKEN}:email`,
    );
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.search).toBe("?code=65925DBB");
  });

  it("tells the cancel control when the confirmação e-mail was not sent, and scrubs that too", async () => {
    window.history.replaceState(null, "", `/barbearia/confirmacao?code=65925DBB#cancel=${TOKEN}&email=falhou`);

    render(<PrivateCancellation code="65925DBB" canCancel onCancelled={() => {}} />);

    expect(await screen.findByTestId("private-cancellation")).toHaveTextContent(`65925DBB:${TOKEN}:sem-email`);
    await waitFor(() => expect(window.location.hash).toBe(""));
  });

  it("consumes and scrubs capabilities from links issued by older versions", async () => {
    window.history.replaceState(
      null,
      "",
      `/barbearia/confirmacao?code=65925DBB&cancel=${TOKEN}`,
    );

    render(<PrivateCancellation code="65925DBB" canCancel onCancelled={() => {}} />);

    expect(await screen.findByTestId("private-cancellation")).toHaveTextContent(TOKEN);
    await waitFor(() => expect(window.location.search).toBe("?code=65925DBB"));
  });

  it("still scrubs the capability but offers no cancellation once the booking is not confirmed", async () => {
    render(<PrivateCancellation code="65925DBB" canCancel={false} onCancelled={() => {}} />);

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(screen.queryByTestId("private-cancellation")).not.toBeInTheDocument();
  });
});
