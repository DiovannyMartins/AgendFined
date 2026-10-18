// Link to the negócio's public page, used to invite the cliente to reserve
// another horário. It carries no booking data and no capability.
export function buildPublicBookingUrl(origin: URL, slug: string): string {
  return new URL(`/${encodeURIComponent(slug)}`, origin).toString();
}
