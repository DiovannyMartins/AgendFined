import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedAssurance, requiresMfaChallenge } from "@/lib/auth/assurance";
import { getGcalExport } from "@/lib/gcal/get-export";

// "Exportar agenda (.ics)" (INC-3 / US25; needs access, ADR 0013). Built on
// demand when the dono clicks, instead of embedding every future reserva
// (nome, telefone, observação) as a data: URL in the agenda's HTML (#215). The proxy already
// requires a session under /dashboard; a route handler skips the dashboard
// layout, so the second factor is checked here too.
function plain(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const supabase = await createClient();
  const { data: assurance, error } = await getVerifiedAssurance(supabase);
  if (error || requiresMfaChallenge(assurance)) return plain("Confirme o segundo fator para exportar.", 401);

  const result = await getGcalExport();
  if (result.status === "no_business") return plain("Nenhum negócio encontrado.", 404);
  if (result.status === "access_required") return plain("Seu negócio está suspenso. Assine o Plano AgendFined para exportar a agenda.", 403);
  if (result.status === "error") return plain("Não foi possível exportar agora. Tente novamente em instantes.", 503);

  return new NextResponse(result.icsFeed, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="agendfined-agenda.ics"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
