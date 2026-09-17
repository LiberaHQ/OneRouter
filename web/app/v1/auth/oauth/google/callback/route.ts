import { NextResponse } from "next/server";
import { STORE } from "@/lib/gateway/store";
import { signedInBody } from "@/lib/gateway/authRoutes";
import { exchangeCode, GoogleAuthError, resolvedGoogleRedirectUri } from "@/lib/gateway/google";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Redirect relative to the actual request origin, including proxy/SSL termination.
  const proto = (req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "")).split(",")[0].trim() || "http";
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host).split(",")[0].trim();
  const origin = `${proto}://${host}`;
  function redirectToSignin(reason: string): NextResponse {
    return NextResponse.redirect(`${origin}/signin?oauth_error=${encodeURIComponent(reason)}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) return redirectToSignin(err);
  if (!code || !state) return redirectToSignin("missing code or state");

  // One-shot — the same CSRF-nonce pattern as the wallet/email challenges.
  const valid = await STORE.take(state, "oauth_google");
  if (!valid) return redirectToSignin("that sign-in attempt expired; try again");

  let info;
  const redirectUri = resolvedGoogleRedirectUri(req);
  try {
    info = await exchangeCode(code, redirectUri);
  } catch (e) {
    return redirectToSignin(e instanceof GoogleAuthError ? e.message : "Google sign-in failed");
  }

  const [acct, minted] = await STORE.signIn(`google:${info.sub}`);
  if (acct.email !== info.email) {
    acct.email = info.email;
    await STORE.persist();
  }
  const body = await signedInBody(acct, minted, { label: info.email });

  // A one-shot handoff: the callback is a top-level browser navigation, not a fetch,
  // so the result can't be returned as JSON directly — stash it and let the signin
  // page's client code pick it up once.
  const ref = await STORE.stash("oauth_result", { result: body }, 120);
  return NextResponse.redirect(`${origin}/signin?oauth=${ref}`);
}
