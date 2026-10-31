// Marks every response of a route handler as never cacheable, whichever branch
// produced it: the billing and cron routes answer per caller and per moment, and
// no shared cache in front of them may keep or replay an answer (#219).
export function withNoStore<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    const response = await handler(...args);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
}
