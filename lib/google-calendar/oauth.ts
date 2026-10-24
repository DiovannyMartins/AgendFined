import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const TOKEN_CIPHER_SEPARATOR = ".";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export type GoogleUserInfo = { email?: string };

export function getGoogleCalendarRedirectUri(): string {
  const configured = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  if (configured) return configured;
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) throw new Error("GOOGLE_CALENDAR_REDIRECT_URI_MISSING");
  return new URL("/api/google-calendar/callback", appUrl).toString();
}

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CALENDAR_OAUTH_NOT_CONFIGURED");
  return { clientId, clientSecret, redirectUri: getGoogleCalendarRedirectUri() };
}

export function buildGoogleCalendarAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = getOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: `openid email ${GOOGLE_CALENDAR_SCOPE}`,
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// The connection's last_error when Google no longer accepts the refresh token
// (revoked by the owner, or expired: a Testing-mode app's grants last 7 days).
// Retrying never helps; only reconnecting does, which clears last_error.
export const GOOGLE_CALENDAR_REAUTH_REQUIRED = "GOOGLE_CALENDAR_REAUTH_REQUIRED";

async function parseGoogleResponse<T>(response: Response, operation: string): Promise<T> {
  const body = await response.text();
  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    // Google's OAuth error code (e.g. invalid_grant) carries no token.
    const code = typeof (parsed as { error?: unknown } | null)?.error === "string" ? (parsed as { error: string }).error : undefined;
    console.error("google_calendar_api_error", { operation, status: response.status, code });
    if (operation === "token_refresh" && code === "invalid_grant") throw new Error(GOOGLE_CALENDAR_REAUTH_REQUIRED);
    throw new Error(`GOOGLE_CALENDAR_${operation.toUpperCase()}_FAILED`);
  }
  return parsed as T;
}

export async function exchangeGoogleAuthorizationCode(code: string): Promise<Required<Pick<GoogleTokenResponse, "access_token" | "expires_in">> & GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await parseGoogleResponse<GoogleTokenResponse>(response, "token_exchange");
  if (!tokens.access_token || !tokens.expires_in) throw new Error("GOOGLE_CALENDAR_TOKEN_RESPONSE_INVALID");
  return tokens as Required<Pick<GoogleTokenResponse, "access_token" | "expires_in">> & GoogleTokenResponse;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<Required<Pick<GoogleTokenResponse, "access_token" | "expires_in">> & GoogleTokenResponse> {
  const { clientId, clientSecret } = getOAuthConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokens = await parseGoogleResponse<GoogleTokenResponse>(response, "token_refresh");
  if (!tokens.access_token || !tokens.expires_in) throw new Error("GOOGLE_CALENDAR_REFRESH_RESPONSE_INVALID");
  return tokens as Required<Pick<GoogleTokenResponse, "access_token" | "expires_in">> & GoogleTokenResponse;
}

export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseGoogleResponse<GoogleUserInfo>(response, "userinfo");
}

function encryptionKey(): Buffer {
  const encoded = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY_MISSING");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY_INVALID");
  return key;
}

export function encryptGoogleToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map(part => part.toString("base64url")).join(TOKEN_CIPHER_SEPARATOR);
}

export function decryptGoogleToken(payload: string): string {
  const [ivEncoded, tagEncoded, ciphertextEncoded] = payload.split(TOKEN_CIPHER_SEPARATOR);
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error("GOOGLE_CALENDAR_TOKEN_CIPHERTEXT_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64url")), decipher.final()]).toString("utf8");
}
