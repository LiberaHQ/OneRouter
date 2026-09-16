"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api/client";
import { setKey, setSession } from "@/lib/api/tokens";
import type { AuthMethods, SignedIn } from "@/lib/api/types";
import { ApiError } from "@/lib/api/types";

type Method = null | "wallet";

function landed(data: SignedIn, router: ReturnType<typeof useRouter>): { title: string; lines: string[] } | null {
  setSession(data.session);
  if (data.key) setKey(data.key);
  if (data.key && data.recovery) {
    return {
      title: data.new_account ? "Account created" : "Signed in",
      lines: [`Key: ${data.key}`, `Recovery: ${data.recovery}`, "Save both — the recovery secret is shown once."],
    };
  }
  setTimeout(() => router.push("/dashboard"), 900);
  return null;
}

export function AuthPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [method, setMethod] = useState<Method>(null);
  const [methods, setMethods] = useState<AuthMethods["methods"] | null>(null);
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);
  const [reveal, setReveal] = useState<{ title: string; lines: string[] } | null>(null);

  useEffect(() => {
    api.authMethods().then((r) => setMethods(r.methods)).catch(() => {});
  }, []);

  // Google's redirect lands back here as a full page navigation (not a fetch), so the
  // result is picked up once via a short-lived server-side handoff ref in the query
  // string rather than returned directly from the callback.
  useEffect(() => {
    const oauthError = searchParams.get("oauth_error");
    if (oauthError) {
      setStatus({ text: `Google sign-in failed: ${oauthError}`, bad: true });
      router.replace("/signin");
      return;
    }
    const ref = searchParams.get("oauth");
    if (!ref) return;
    router.replace("/signin");
    fetch(`/v1/auth/oauth/result/${ref}`)
      .then((res) => {
        if (!res.ok) throw new Error("sign-in result expired");
        return res.json();
      })
      .then((data: SignedIn) => onSignedIn(data))
      .catch(() => setStatus({ text: "That sign-in attempt expired. Try again.", bad: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function onSignedIn(data: SignedIn) {
    const r = landed(data, router);
    if (r) {
      setReveal(r);
      setStatus(null);
    } else {
      setStatus({ text: "Signed in — opening your dashboard…" });
    }
  }

  function onError(err: unknown) {
    setStatus({ text: err instanceof ApiError ? err.message : "Something went wrong. Try again.", bad: true });
  }

  if (reveal) {
    return (
      <div className="auth-panel">
        <h2>{reveal.title}</h2>
        <dl className="secret">
          {reveal.lines.slice(0, 2).map((line) => {
            const [label, ...rest] = line.split(": ");
            return (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="m-id">{rest.join(": ")}</dd>
              </div>
            );
          })}
        </dl>
        <p>{reveal.lines[2]}</p>
        <div className="auth-actions">
          <button className="btn primary" onClick={() => router.push("/dashboard")}>
            Continue to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {methods?.google.ready && (
        <a className="auth-row primary" href="/v1/auth/oauth/google/start" data-method="google">
          <span>Continue with Google</span>
          <span className="arrow">&rarr;</span>
        </a>
      )}
      <button
        type="button"
        className="auth-row"
        data-method="wallet"
        disabled={methods ? !methods.wallet.ready : false}
        onClick={() => setMethod(method === "wallet" ? null : "wallet")}
      >
        <span>Continue with a wallet</span>
        <span className="arrow">&rarr;</span>
      </button>

      <p className="auth-foot">Your key is the account. There is no profile behind it, and nothing to fill in.</p>

      {method === "wallet" && <WalletPanel onSignedIn={onSignedIn} onError={onError} setStatus={setStatus} />}

      {status && <p className={status.bad ? "auth-status bad" : "auth-status ok"}>{status.text}</p>}
    </>
  );
}

function WalletPanel({
  onSignedIn,
  onError,
  setStatus,
}: {
  onSignedIn: (d: SignedIn) => void;
  onError: (e: unknown) => void;
  setStatus: (s: { text: string; bad?: boolean } | null) => void;
}) {
  const [hasEthereum, setHasEthereum] = useState(false);
  const [hasSolana, setHasSolana] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHasEthereum(typeof window !== "undefined" && !!(window as any).ethereum);
    setHasSolana(typeof window !== "undefined" && !!(window as any).solana?.isPhantom);
  }, []);

  const ARC_CHAIN = {
    chainId: "0x13b2",
    chainName: "Arc",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: ["https://rpc.mainnet.arc.io"],
    blockExplorerUrls: ["https://explorer.arc.io"],
  };

  async function connectArc() {
    setBusy(true);
    setStatus(null);
    try {
      const eth = (window as any).ethereum;
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      const address = accounts[0];
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN.chainId }] });
      } catch {
        try {
          await eth.request({ method: "wallet_addEthereumChain", params: [ARC_CHAIN] });
        } catch {
          // proceed anyway — the signature itself doesn't require the chain switch to succeed
        }
      }
      const { ref, message } = await api.walletChallenge("arc", address);
      const signature: string = await eth.request({ method: "personal_sign", params: [message, address] });
      const data = await api.walletVerify(ref, signature);
      onSignedIn(data);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function connectSolana() {
    setBusy(true);
    setStatus(null);
    try {
      const sol = (window as any).solana;
      const resp = await sol.connect();
      const address: string = resp.publicKey.toString();
      const { ref, message } = await api.walletChallenge("solana", address);
      const encoded = new TextEncoder().encode(message);
      const signed = await sol.signMessage(encoded, "utf8");
      const sigBytes: Uint8Array = signed.signature ?? signed;
      const signature = Buffer.from(sigBytes).toString("base64url");
      const data = await api.walletVerify(ref, signature);
      onSignedIn(data);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-panel">
      <h2>Continue with a wallet</h2>
      <p>A signature proves you hold the key. It authorises nothing else — no transaction, no transfer, no spend.</p>
      <div className="auth-actions">
        {hasEthereum && (
          <button className="btn primary" disabled={busy} onClick={connectArc}>
            Connect Arc wallet
          </button>
        )}
        {hasSolana && (
          <button className="btn primary" disabled={busy} onClick={connectSolana}>
            Connect Solana wallet
          </button>
        )}
        {!hasEthereum && !hasSolana && <p className="auth-status bad">No wallet extension detected in this browser.</p>}
      </div>
    </div>
  );
}
