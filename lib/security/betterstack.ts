const INGESTING_HOST = "s2774229.us-west-2a.betterstackdata.com";

// Better Stack accepts one JSON object per request. Keep the source token only
// in server-side environment variables; never put it in a URL or client bundle.
export async function sendSecurityLog(entry: Record<string, string | null>): Promise<void> {
  const token = process.env.BETTERSTACK_SOURCE_TOKEN;
  if (!token || process.env.NODE_ENV !== "production") return;

  try {
    const response = await fetch(`https://${INGESTING_HOST}/`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) console.warn("Better Stack ingestion failed", response.status);
  } catch {
    console.warn("Better Stack ingestion unavailable");
  }
}
