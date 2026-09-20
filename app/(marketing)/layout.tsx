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
      <Navbar isAuthenticated={Boolean(user)} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
