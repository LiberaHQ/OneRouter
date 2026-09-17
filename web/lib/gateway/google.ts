// Google OAuth (authorization code flow). New surface — the original OneRouter
// deliberately removed third-party sign-in ("no third-party sign-in... the only
// identities are an email address and a wallet address"), so this is an intentional
// re-addition at the user's request, not a port of existing Python code.
const CLIENT_ID = process.env.ONEROUTER_GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.ONEROUTER_GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.ONEROUTER_GOOGLE_REDIRECT_URI || "";

export function resolvedGoogleRedirectUri(req?: Request): string {
  const configured = process.env.ONEROUTER_GOOGLE_REDIRECT_URI?.trim();
  if (configured) return configured;

  const fallback = "http://localhost:8080/v1/auth/oauth/google/callback";
  if (!req) return fallback;

  const url = new URL(req.url);
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = (forwardedProto || url.protocol.replace(":", "")).split(",")[0].trim() || "http";
  const host = (forwardedHost || url.host).split(",")[0].trim();
  return `${proto}://${host}/v1/auth/oauth/google/callback`;
}

export function googleReady(req?: Request): boolean {
  const redirectUri = req ? resolvedGoogleRedirectUri(req) : REDIRECT_URI || "";
  return Boolean(CLIENT_ID && CLIENT_SECRET && redirectUri);
}

export function authUrl(state: string, redirectUri: string = REDIRECT_URI): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

export class GoogleAuthError extends Error {}

export async function exchangeCode(code: string, redirectUri: string = REDIRECT_URI): Promise<GoogleUserInfo> {
  if (!redirectUri || !CLIENT_ID || !CLIENT_SECRET) {
    throw new GoogleAuthError("Google sign-in is not configured");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const token = (await tokenRes.json()) as TokenResponse;
  if (!tokenRes.ok || token.error) {
    throw new GoogleAuthError(token.error_description || token.error || "token exchange failed");
  }

  // The access token was obtained through a confidential server-to-server exchange
  // (client_secret required), so userinfo's own authentication is sufficient — no
  // separate id_token signature verification needed.
  const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!infoRes.ok) throw new GoogleAuthError("could not fetch account info from Google");
  const info = (await infoRes.json()) as GoogleUserInfo;
  if (!info.email || !info.sub) throw new GoogleAuthError("Google did not return an email/subject");
  return info;
}
