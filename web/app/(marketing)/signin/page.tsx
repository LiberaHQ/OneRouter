import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPanel } from "@/components/signin/AuthPanel";
import { BRAND, API } from "@/lib/content/nav";

export const metadata: Metadata = {
  title: `Sign in · ${BRAND}`,
  description: "Sign in with Google or a wallet. No profile, no account to fill in.",
  alternates: { canonical: "/signin" },
};

export default function SignInPage() {
  return (
    <main className="page auth-page plain" id="signin">
      <section className="authbox">
        <h1>Welcome to {BRAND}</h1>
        <p className="auth-sub">Sign in with Google or a wallet. Either one mints your key.</p>
        <Suspense fallback={null}>
          <AuthPanel />
        </Suspense>
        <noscript>
          <p className="note">
            Signing in needs JavaScript, because every method here is a live exchange with the gateway. You can
            still create a key without one: <code>curl -X POST {API}/keys</code>.
          </p>
        </noscript>
      </section>
    </main>
  );
}
