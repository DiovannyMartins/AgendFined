const WEBHOOK_DATA_ID = /^[A-Za-z0-9._:-]{1,200}$/;

// The provider signs the query-string data.id. The body may repeat that field,
// but it can never select a different resource after signature verification.
export function resolveSignedWebhookDataId(
  signedQueryId: string | null | undefined,
  bodyId: string | null | undefined,
): string | null {
  if (!signedQueryId || !WEBHOOK_DATA_ID.test(signedQueryId)) return null;
  if (bodyId !== undefined && bodyId !== null && bodyId !== signedQueryId) return null;
  return signedQueryId;
}
