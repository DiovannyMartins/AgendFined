import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Tells the static marketing pages whether the visitor is signed in, so they
// can switch "Entrar" for "Abrir painel" without making the page dynamic.
// Returns only a boolean; never user data.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json(
    { authenticated: Boolean(user) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
