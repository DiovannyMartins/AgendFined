import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateCancellation } from "./private-cancellation";

vi.mock("./cancel-booking", () => ({
  CancelBooking: ({
    code,
    token,
    confirmationEmail = "sent",
    privateUrl,
  }: {
    code: string;
    token: string;
    confirmationEmail?: string;
    privateUrl?: string;
  }) => (
    <div data-testid="private-cancellation" data-private-url={privateUrl}>{`${code}:${token}:${confirmationEmail}`}</div>
  ),
}));

vi.mock("./reschedule-booking", () => ({
  RescheduleBooking: ({ token, currentStartAt }: { token: string; currentStartAt: string }) => (
    <div data-testid="private-reschedule">{`${token}:${currentStartAt}`}</div>
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
      `65925DBB:${TOKEN}:sent`,
    );
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.search).toBe("?code=65925DBB");
  });

  it("tells the cancel control when the confirmação e-mail was not sent, and scrubs that too", async () => {
    window.history.replaceState(null, "", `/barbearia/confirmacao?code=65925DBB#cancel=${TOKEN}&email=falhou`);

    render(<PrivateCancellation code="65925DBB" canCancel onCancelled={() => {}} />);

    expect(await screen.findByTestId("private-cancellation")).toHaveTextContent(`65925DBB:${TOKEN}:failed`);
    await waitFor(() => expect(window.location.hash).toBe(""));
  });

  // #195: sem e-mail, o cliente guarda o link; ele não leva a marca do e-mail.
  it("offers the private link to keep when the cliente gave no e-mail", async () => {
    window.history.replaceState(null, "", `/barbearia/confirmacao?code=65925DBB#cancel=${TOKEN}&email=sem`);

    render(<PrivateCancellation code="65925DBB" canCancel onCancelled={() => {}} />);

    const control = await screen.findByTestId("private-cancellation");
    expect(control).toHaveTextContent(`65925DBB:${TOKEN}:none`);
    expect(control).toHaveAttribute(
      "data-private-url",
      `${window.location.origin}/barbearia/confirmacao?code=65925DBB#cancel=${TOKEN}`,
    );
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

  // #194: the same capability offers the remarcação next to the cancellation.
  it("offers the remarcação with the same capability while the booking is confirmed", async () => {
    const reschedule = { timezone: "America/Sao_Paulo", startAt: "2026-10-26T13:00:00.000Z" };
    const { unmount } = render(
      <PrivateCancellation code="65925DBB" canCancel onCancelled={() => {}} reschedule={reschedule} />,
    );

    expect(await screen.findByTestId("private-reschedule")).toHaveTextContent(`${TOKEN}:2026-10-26T13:00:00.000Z`);
    unmount();

    window.history.replaceState(null, "", `/barbearia/confirmacao?code=65925DBB#cancel=${TOKEN}`);
    render(<PrivateCancellation code="65925DBB" canCancel={false} onCancelled={() => {}} reschedule={reschedule} />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(screen.queryByTestId("private-reschedule")).not.toBeInTheDocument();
  });
});
