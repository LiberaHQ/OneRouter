import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInGate } from "@/components/signin/SignInGate";
import { BRAND, API } from "@/lib/content/nav";

export const metadata: Metadata = {
  title: `Sign in · ${BRAND}`,
  description: "Sign in with Google or a wallet. No profile, no account to fill in.",
  alternates: { canonical: "/signin" },
};

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="page auth-page plain" aria-busy="true" />}>
      <SignInGate brand={BRAND} apiUrl={API} />
    </Suspense>
  );
}
