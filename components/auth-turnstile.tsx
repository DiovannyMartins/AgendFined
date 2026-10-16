"use client";

import { useCallback, useState } from "react";
import { TurnstileWidget } from "@/components/turnstile-widget";

// Turnstile for the Supabase Auth forms. Supabase Auth verifies the token when
// CAPTCHA protection is enabled; each token is single-use, so every submission
// must be followed by `renew()` to render a fresh challenge.
export function useAuthTurnstile() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const required = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  const renew = useCallback(() => {
    setToken("");
    setAttempt((value) => value + 1);
  }, []);

  return {
    token,
    canSubmit: ready && (!required || token !== ""),
    renew,
    widget: <TurnstileWidget key={attempt} action="auth" onToken={setToken} onState={setReady} />,
  };
}
