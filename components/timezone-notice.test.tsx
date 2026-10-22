import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimezoneNotice } from "./timezone-notice";

function browserIn(timeZone: string) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...real.call(this), timeZone };
  });
}

describe("TimezoneNotice", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the negócio's fuso when the cliente's browser is in another one", () => {
    browserIn("America/Sao_Paulo");

    render(<TimezoneNotice timezone="America/Manaus" at="2026-10-20T14:00:00Z" />);

    expect(screen.getByText("Horários no fuso de Manaus (UTC−4).")).toBeInTheDocument();
  });

  it("stays silent when the browser has the same offset as the negócio", () => {
    browserIn("America/Fortaleza");

    const { container } = render(<TimezoneNotice timezone="America/Sao_Paulo" at="2026-10-20T14:00:00Z" />);

    expect(container).toBeEmptyDOMElement();
  });
});
