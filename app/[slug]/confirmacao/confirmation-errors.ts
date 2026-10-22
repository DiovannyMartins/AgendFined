// A confirmation that could not be loaded is not a missing one (#140): the
// booking exists, only the lookup was refused or failed. The page throws these
// before streaming, so the response is a 5xx (never a 404), and the stable
// digest reaches error.tsx in production, where the message is redacted.
export const CONFIRMATION_RATE_LIMITED = "AGENDFINED_CONFIRMATION_RATE_LIMITED";
export const CONFIRMATION_UNAVAILABLE = "AGENDFINED_CONFIRMATION_UNAVAILABLE";

export type ConfirmationFailure = "rate_limited" | "unavailable";

export class ConfirmationLookupError extends Error {
  readonly digest: string;

  constructor(readonly reason: ConfirmationFailure) {
    super(`confirmation_lookup_${reason}`);
    this.name = "ConfirmationLookupError";
    this.digest = reason === "rate_limited" ? CONFIRMATION_RATE_LIMITED : CONFIRMATION_UNAVAILABLE;
  }
}
