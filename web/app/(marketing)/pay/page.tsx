import type { Metadata } from "next";
import { PayFlow } from "@/components/pay/PayFlow";
import { BRAND } from "@/lib/content/nav";

export const metadata: Metadata = {
  title: `Add credit · ${BRAND}`,
  description: "Fund a key with USDC on Arc. Every key has its own deposit address, so any amount you send is credited to it.",
  alternates: { canonical: "/pay" },
};

export default function PayPage() {
  return (
    <main className="page narrow" id="pay">
      <section className="page-head">
        <div className="crumbs">
          <a href="/">Home</a> <span>/</span> <span>Add credit</span>
        </div>
        <span className="kicker">Funding</span>
        <h1>Pay in USDC on Arc.</h1>
        <p className="sub">Your key has its own deposit address. Send USDC to it and the credit lands once the network confirms.</p>
      </section>

      <PayFlow />

      <h2 className="sec">What Arc settles in</h2>
      <p>
        Arc uses USDC as its native asset, so a deposit is an ordinary transfer. The gateway reads the USDC{" "}
        <code>Transfer</code> log and credits your key after the configured number of confirmations.
      </p>
      <p className="note">
        USDC on Arc is reported in two scales: transaction values carry 18 decimals like any EVM native asset, while
        the token interface reports 6. Amounts on this page are USDC, read from the 6-decimal figure.
      </p>
    </main>
  );
}
