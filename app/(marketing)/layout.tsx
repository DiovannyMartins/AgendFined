import type { ReactNode } from "react";
import { Navbar } from "./navbar";
import { Footer } from "./footer";

// Static on purpose: no per-request auth lookup here, so the marketing pages
// are served from the CDN. The navbar resolves the session on the client.
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      <Navbar />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
