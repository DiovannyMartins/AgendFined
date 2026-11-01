import { NextResponse, type NextRequest } from "next/server";
import { getPublicSlots, type PublicSlotsError } from "@/lib/availability/public-slots";
import { getClientIpFromHeaders } from "@/lib/booking/rate-limit";

// Free slots for the public page (#216). A GET, unlike a Server Action, runs
// in parallel and the widget can abort it when the date or serviço changes.
// The body keeps the codes the Server Action returned.
const STATUS: Record<PublicSlotsError, number> = {
  validation: 400,
  not_found: 404,
  service_not_found: 404,
  booking_window: 422,
  suspended: 409,
  rate_limited: 429,
  db_error: 503,
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = await getPublicSlots(
    {
      businessId: params.get("businessId") ?? undefined,
      serviceId: params.get("serviceId") ?? undefined,
      date: params.get("date") ?? undefined,
    },
    getClientIpFromHeaders(request.headers),
  );
  return NextResponse.json(result, {
    status: result.error ? STATUS[result.error] : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
