import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateCancellation } from "./private-cancellation";

vi.mock("./cancel-booking", () => ({
  CancelBooking: ({ code, token }: { code: string; token: string }) => (
    <div data-testid="private-cancellation">{`${code}:${token}`}</div>
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
      `65925DBB:${TOKEN}`,
    );
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.search).toBe("?code=65925DBB");
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
