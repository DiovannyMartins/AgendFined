"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
          action?: string;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// Load Cloudflare's api.js exactly once per page, guarded by a module-level
// promise. Loading it more than once is actively harmful: Turnstile's loader
// replaces `window.turnstile` (a placeholder) with the real API only on the
// first execution. A second execution logs "Turnstile already has been loaded"
// and leaves `window.turnstile.render` permanently undefined, so the widget
// would time out into the "Não foi possível carregar a verificação" error.
let turnstileLoadPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  // Already booted to the real API -> nothing to do.
  if (typeof window.turnstile?.render === "function") return Promise.resolve();
  // An injection is already in flight -> reuse it.
  if (turnstileLoadPromise) return turnstileLoadPromise;

  turnstileLoadPromise = new Promise<void>((resolve, reject) => {
    const onError = () => {
      // Allow a later "Tentar novamente" to re-attempt the load.
      turnstileLoadPromise = null;
      reject(new Error("Failed to load the Turnstile api.js"));
    };

    // A script tag from a previous mount / client navigation may already exist.
    // Never inject a second one (that is what triggers the broken double-load).
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]',
    );
    if (existing) {
      if (typeof window.turnstile?.render === "function") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", onError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = onError;
    document.head.appendChild(script);
  });

  return turnstileLoadPromise;
}

// Cloudflare Turnstile anti-bot widget (§17). Renders the challenge only when a
// public site key is configured (NEXT_PUBLIC_TURNSTILE_SITE_KEY); otherwise it
// renders nothing and the server-side gate stays fail-open. The token and a
// "challenge resolved" boolean are surfaced to the parent form.
//
// The security boundary stays fail-closed server-side (a bot can never submit
// without a valid token). On the client we make the failure *recoverable*: a
// transient error (Cloudflare down, blocklisted region, scripting glitch) shows
// a "Tentar novamente" button that re-renders the challenge, instead of leaving
// a real customer permanently unable to book.
//
// Memoized so re-renders of the parent form (e.g. when the token arrives) do
// NOT recreate the container div, which would destroy the injected Turnstile
// iframe and loop forever.
export const TurnstileWidget = memo(function TurnstileWidget({
  onToken,
  onState,
  action,
}: {
  onToken: (token: string) => void;
  onState?: (ready: boolean) => void;
  action: "booking_write" | "booking_consult";
}) {
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (!sitekey) {
      // Fail-open: without a sitekey there is no widget to solve, so the form is
      // never blocked waiting on it.
      if (onState) onState(true);
      return;
    }
    // With a sitekey the challenge must be solved before any submit. Start the
    // form disabled so a customer can't submit with an empty token and get a
    // spurious "human verification failed" rejection.
    if (onState) onState(false);
    let cancelled = false;
    let polls = 0;

    const render = () => {
      const el = containerRef.current;
      // `window.turnstile` may briefly be the loader's placeholder object before
      // `render` is installed; only proceed once it is a real function.
      if (!el || typeof window.turnstile?.render !== "function") return false;
      try {
        const id = window.turnstile.render(el, {
          sitekey,
          action,
          // Site is dark-only (see globals.css :root), so render the challenge
          // in dark to match the background instead of defaulting to light.
          theme: "dark",
          callback: (token) => {
            widgetIdRef.current = id;
            setError(false);
            setResolved(true);
            onToken(token);
          },
          "expired-callback": () => {
            setResolved(false);
            onToken("");
          },
          "error-callback": () => {
            setError(true);
            setResolved(false);
            onToken("");
          },
        });
        widgetIdRef.current = id;
      } catch {
        return false;
      }
      return true;
    };

    const run = () => {
      if (cancelled) return;
      if (render()) {
        if (onState) onState(true);
        return;
      }
      if (polls++ < 50) {
        window.setTimeout(run, 200);
      } else {
        setError(true);
        if (onState) onState(false);
      }
    };

    loadTurnstile()
      .then(run)
      .catch(() => {
        if (cancelled) return;
        setError(true);
        if (onState) onState(false);
      });

    return () => {
      cancelled = true;
      // Tear down a previously rendered widget so a retry doesn't stack frames.
      if (widgetIdRef.current && window.turnstile?.reset) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
    };
  }, [sitekey, onToken, onState, action, retry]);

  // Retry: bump the counter to re-run the effect (re-render the challenge). If
  // the script failed to load we also clear the cached promise via the
  // rejection path in loadTurnstile, so this genuinely re-attempts.
  const retryChallenge = useCallback(() => {
    setError(false);
    setResolved(false);
    onToken("");
    if (onState) onState(false);
    setRetry((r) => r + 1);
  }, [onToken, onState]);

  if (!sitekey) {
    return null;
  }

  return (
    <>
      <div ref={containerRef} className="flex justify-center py-2" data-testid="turnstile-widget" />
      {error && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-destructive">Não foi possível carregar a verificação.</p>
          <button
            type="button"
            onClick={retryChallenge}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      )}
      <span className="sr-only" data-testid="turnstile-solved" data-solved={resolved ? "true" : "false"}></span>
    </>
  );
});
