const WEBHOOK_DATA_ID = /^[A-Za-z0-9._:-]{1,200}$/;

// The provider signs the query-string data.id. The body may repeat that field,
// but it can never select a different resource after signature verification.
// The id is lowercased once here: the signature manifest lowercases it, so the
// provider read and the subscription lookup use that same id (Mercado Pago
// preapproval ids are lowercase).
export function resolveSignedWebhookDataId(
  signedQueryId: string | null | undefined,
  bodyId: string | null | undefined,
): string | null {
  if (!signedQueryId || !WEBHOOK_DATA_ID.test(signedQueryId)) return null;
  const id = signedQueryId.toLowerCase();
  if (bodyId !== undefined && bodyId !== null && bodyId.toLowerCase() !== id) return null;
  return id;
}
