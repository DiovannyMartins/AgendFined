import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";
import { queueAfterResponse, resetAfterResponse } from "./mocks/after-response";

// after() only works inside a Next request; tests flush its queue explicitly.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: queueAfterResponse,
}));

beforeEach(() => resetAfterResponse());
