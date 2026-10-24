// A confirmation that could not be loaded is not a missing one (#140): the
// booking exists, only the lookup failed. The page throws this before
// streaming, so the response is a 5xx (never a 404), and the stable digest
// reaches error.tsx in production, where the message is redacted. A rate limit
// never gets here: the proxy answers it with 429 (#179).
export const CONFIRMATION_UNAVAILABLE = "AGENDFINED_CONFIRMATION_UNAVAILABLE";

export class ConfirmationLookupError extends Error {
  readonly digest = CONFIRMATION_UNAVAILABLE;

  constructor() {
    super("confirmation_lookup_unavailable");
    this.name = "ConfirmationLookupError";
  }
}
