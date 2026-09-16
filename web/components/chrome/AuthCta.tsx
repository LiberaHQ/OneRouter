"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { hasKey, hasSession } from "@/lib/api/tokens";

export function AuthCta() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(hasKey() || hasSession());
  }, []);

  if (signedIn) {
    return (
      <Link className="btn primary" href="/dashboard">
        Dashboard
      </Link>
    );
  }
  return (
    <Link className="btn primary" href="/signin">
      Get a key
    </Link>
  );
}
