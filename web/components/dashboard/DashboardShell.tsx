"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Mark } from "@/components/chrome/Mark";
import { api } from "@/lib/api/client";
import { principal, clearKey, clearSession } from "@/lib/api/tokens";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/keys", label: "API Keys" },
  { href: "/dashboard/models", label: "Models" },
  { href: "/chat", label: "Chat" },
  { href: "/pay", label: "Billing" },
];

export function DashboardShell({ brand, children }: { brand: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  async function signOut() {
    const token = principal();
    if (token) {
      try {
        await api.signout(token);
      } catch {
        // best-effort — clear local tokens regardless
      }
    }
    clearKey();
    clearSession();
    router.push("/");
  }

  return (
    <div className="dash">
      <aside className="side">
        <div className="side-head">
          <Link className="brand" href="/">
            <Mark />
            <span>{brand}</span>
          </Link>
        </div>
        <nav className="side-nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="side-scroll" />
        <div className="side-foot">
          <button className="btn sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <header className="dash-top">
        <nav>
          <Link href="/">Home</Link>
          <Link href="/models">Models</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/docs/quickstart">Docs</Link>
        </nav>
        <span className="spacer" />
        <Link className="btn sm" href="/support">
          Need help?
        </Link>
      </header>
      <main className="dash-main">{children}</main>
    </div>
  );
}
