import type { ReactNode } from "react";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { Navbar } from "./navbar";
import { Footer } from "./footer";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      <Navbar isAuthenticated={Boolean(user)} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
