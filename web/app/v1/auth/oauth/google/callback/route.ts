import { NextResponse } from "next/server";
import { STORE } from "@/lib/gateway/store";
import { signedInBody } from "@/lib/gateway/authRoutes";
import { exchangeCode, GoogleAuthError } from "@/lib/gateway/google";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Redirect relative to this request's own origin, not the public SITE constant —
  // this route is reachable at whatever origin ONEROUTER_GOOGLE_REDIRECT_URI points
  // to (localhost in dev), which may differ from the production domain.
  const origin = url.origin;
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
  try {
    info = await exchangeCode(code);
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
