"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPanel } from "@/components/signin/AuthPanel";
import { api } from "@/lib/api/client";
import { clearKey, clearSession, getSession } from "@/lib/api/tokens";

export function SignInGate({ brand, apiUrl }: { brand: string; apiUrl: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  /* Browser-local authentication can only be checked after hydration. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("oauth") || params.has("oauth_error")) {
      setReady(true);
      return;
    }

    const session = getSession();
    if (!session) {
      setReady(true);
      return;
    }

    api.session(session)
      .then(() => router.replace("/dashboard"))
      .catch(() => {
        clearSession();
        clearKey();
        setReady(true);
      });
  }, [router]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!ready) {
    return <main className="page auth-page plain" aria-busy="true" />;
  }

  return (
    <main className="page auth-page plain" id="signin">
      <section className="authbox">
        <h1>Welcome to {brand}</h1>
        <p className="auth-sub">Sign in with Google or a wallet. Either one mints your key.</p>
        <AuthPanel />
        <noscript>
          <p className="note">
            Signing in needs JavaScript, because every method here is a live exchange with the gateway. You can
            still create a key without one: <code>curl -X POST {apiUrl}/keys</code>.
          </p>
        </noscript>
      </section>
    </main>
  );
}
