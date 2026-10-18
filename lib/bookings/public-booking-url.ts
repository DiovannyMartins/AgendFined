// Link to the negócio's public page, used to invite the cliente to reserve
// another horário. It carries no booking data and no capability.
export function buildPublicBookingUrl(configuredOrigin: string, slug: string): string {
  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
  } catch {
    origin = new URL("http://localhost:3000");
  }
  return new URL(`/${encodeURIComponent(slug)}`, origin).toString();
}
