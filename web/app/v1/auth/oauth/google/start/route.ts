import { NextResponse } from "next/server";
import { STORE } from "@/lib/gateway/store";
import { authUrl, googleReady, resolvedGoogleRedirectUri } from "@/lib/gateway/google";

export async function GET(req: Request) {
  const redirectUri = resolvedGoogleRedirectUri(req);
  if (!googleReady(req)) {
    return new NextResponse("Google sign-in is not configured", { status: 503 });
  }
  const ref = await STORE.stash("oauth_google", {}, 600);
  return NextResponse.redirect(authUrl(ref, redirectUri));
}
