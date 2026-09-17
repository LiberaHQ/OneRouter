"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { clearKey, clearSession, getSession } from "@/lib/api/tokens";

export function AccountMenu({ placement = "sidebar" }: { placement?: "sidebar" | "navbar" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accountLabel, setAccountLabel] = useState("Account");
  const [available, setAvailable] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const token = getSession();
    if (!token) return;
    api.session(token)
      .then((session) => {
        setAccountLabel(session.email || identityLabel(session.identities, session.account));
        setAvailable(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function closeAccountMenu(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeAccountMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeAccountMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function signOut() {
    const token = getSession();
    setOpen(false);
    setAvailable(false);
    clearKey();
    clearSession();
    router.replace("/");
    router.refresh();
    if (token) {
      // Browser logout is immediate; revocation can finish after navigation.
      void api.signout(token).catch(() => {});
    }
  }

  if (!available) return null;

  const initials = accountLabel.slice(0, 2).toUpperCase();
  return (
    <div className={`account-control ${placement === "navbar" ? "navbar-account" : ""}`} ref={accountRef}>
      {open && (
        <div className="account-popover" role="menu">
          <div className="account-summary">
            <span className="account-avatar" aria-hidden="true">{initials}</span>
            <span>
              <b>{accountLabel}</b>
              <small>OneRouter account</small>
            </span>
          </div>
          <div className="account-divider" />
          {placement === "navbar" && (
            <Link className="account-menu-item" role="menuitem" href="/dashboard" onClick={() => setOpen(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="4" width="6" height="6" rx="1" />
                <rect x="14" y="4" width="6" height="6" rx="1" />
                <rect x="4" y="14" width="6" height="6" rx="1" />
                <rect x="14" y="14" width="6" height="6" rx="1" />
              </svg>
              <span>Dashboard</span>
            </Link>
          )}
          <button type="button" className="account-menu-item" role="menuitem" onClick={signOut}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5H5.8A1.8 1.8 0 0 0 4 6.8v10.4A1.8 1.8 0 0 0 5.8 19H9" />
              <path d="M13 8l4 4-4 4" />
              <path d="M17 12H8" />
            </svg>
            <span>Log out</span>
          </button>
        </div>
      )}
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-avatar" aria-hidden="true">{initials}</span>
        <span className="account-trigger-label">{accountLabel}</span>
        <svg className="account-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}

function identityLabel(identities: string[], fallback: string): string {
  const identity = identities.find((value) => value.startsWith("email:")) ?? identities[0];
  if (!identity) return fallback;
  const separator = identity.indexOf(":");
  const value = separator === -1 ? identity : identity.slice(separator + 1);
  if (value.includes("@")) return value;
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}
