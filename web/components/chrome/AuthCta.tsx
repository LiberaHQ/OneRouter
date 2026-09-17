"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountMenu } from "@/components/chrome/AccountMenu";
import { hasSession, onAuthChange } from "@/lib/api/tokens";

export function AuthCta() {
  const [signedIn, setSignedIn] = useState(false);

  /* Authentication state is browser-local and must hydrate after the server render. */
  useEffect(() => {
    const syncAuth = () => setSignedIn(hasSession());
    syncAuth();
    return onAuthChange(syncAuth);
  }, []);

  if (signedIn) {
    return <AccountMenu placement="navbar" />;
  }
  return (
    <Link className="btn primary" href="/signin">
      Get a key
    </Link>
  );
}
