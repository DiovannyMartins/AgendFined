"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Registra apenas o digest; a mensagem pode conter dados sensíveis.
    console.error("Erro global de renderização", error.digest ?? "sem-digest");
  }, [error]);

  return (
    <html lang="pt-BR">
      <head>
        <title>Algo deu errado — AgendFined</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#141414",
          color: "#eeeeee",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p style={{ color: "#b0b0b0", fontSize: "0.8rem", letterSpacing: "0.18em", textTransform: "uppercase" }}>
            AgendFined
          </p>
          <h1 style={{ fontSize: "clamp(2rem, 8vw, 4rem)", lineHeight: 1, margin: "1rem 0" }}>
            Tivemos um imprevisto.
          </h1>
          <p style={{ color: "#b0b0b0", lineHeight: 1.6 }}>
            Não foi possível carregar esta página agora. Tente novamente ou volte em alguns instantes.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "1.5rem",
              minHeight: "44px",
              border: 0,
              borderRadius: "999px",
              padding: "0.75rem 1.25rem",
              background: "#ffffff",
              color: "#111111",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
