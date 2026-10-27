// Bearer check for the pg_cron caller, without an early-exit string compare.
//
// Both sides are hashed with SHA-256 first, so the comparison always runs over
// 32 bytes no matter what the caller sent (length included), and the XOR loop
// touches every byte. Fails closed when the secret is not configured.

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string,
): Promise<boolean> {
  if (!secret) return false;
  const [given, expected] = await Promise.all([
    sha256(authorization ?? ""),
    sha256(`Bearer ${secret}`),
  ]);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given[i] ^ expected[i];
  return diff === 0;
}
