"use client";

import { useEffect, useState } from "react";

// One request per page load, shared by every component that asks.
let sessionRequest: Promise<boolean> | null = null;

function fetchIsAuthenticated(): Promise<boolean> {
  sessionRequest ??= fetch("/api/session", { cache: "no-store", credentials: "same-origin" })
    .then((response) => (response.ok ? response.json() : { authenticated: false }))
    .then((body: { authenticated?: unknown }) => body.authenticated === true)
    .catch(() => false);
  return sessionRequest;
}

/**
 * Whether the visitor is signed in, resolved on the client after the static
 * page renders. Starts as `false` (the anonymous UI). Pass `override` to skip
 * the request (tests, or when the server already knows).
 */
export function useIsAuthenticated(override?: boolean): boolean {
  const [authenticated, setAuthenticated] = useState(override ?? false);

  useEffect(() => {
    if (override !== undefined) return;
    let active = true;
    void fetchIsAuthenticated().then((value) => {
      if (active) setAuthenticated(value);
    });
    return () => {
      active = false;
    };
  }, [override]);

  return override ?? authenticated;
}
