import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAppOrigin } from "@/lib/app-origin";
import { publicCodeSchema } from "@/lib/validation/schemas";
import { buildCustomerIcs, customerIcsFilename } from "@/lib/gcal/customer-event";

// "Adicionar à minha agenda" on the confirmation (#196). A served
// text/calendar file, not a blob or data: URL, because that is what iOS Safari
// hands to the Calendar app; Chrome on Android downloads it and opens it in
// the phone's calendar. `inline` keeps Safari from parking it in Downloads.
// The per-IP confirmation limiter already ran in the proxy, since this
// resolves the same código público (lib/booking/confirmation-gate.ts). Only a
// confirmed reserva that has not started gets an event; the confirmation hides
// the button in every other state.

function plain(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const parsedCode = publicCodeSchema.safeParse(request.nextUrl.searchParams.get("code") ?? "");
  if (!parsedCode.success) return plain("Reserva não encontrada.", 404);
  const code = parsedCode.data;

  const { data, error } = await createAdminClient().rpc("get_booking_by_public_code", { p_code: code });
  if (error) return plain("Não foi possível gerar o evento agora. Tente novamente em instantes.", 503);

  const booking = data?.[0];
  if (!booking) return plain("Reserva não encontrada.", 404);
  if (booking.status !== "confirmed" || Date.parse(booking.start_at) <= Date.now()) {
    return plain("Esta reserva não está mais confirmada para um horário futuro.", 404);
  }

  return new NextResponse(buildCustomerIcs({ ...booking, code }, resolveAppOrigin()), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${customerIcsFilename(code)}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
