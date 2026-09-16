import type { Metadata } from "next";
import { KeysFlow } from "@/components/keys/KeysFlow";
import { codeBlock } from "@/lib/markdown/codeBlock";
import { API, BRAND } from "@/lib/content/nav";

export const metadata: Metadata = {
  title: `Get an API key · ${BRAND}`,
  description: "Create a key without an account, fund it with USDC on Arc, and watch the deposit land. No KYC, no expiry, deposits only.",
  alternates: { canonical: "/keys" },
};

export default function KeysPage() {
  const snippet = codeBlock(
    "shell",
    `export ONEROUTER_KEY=or-live-YOUR-KEY-HERE
export OPENAI_BASE_URL=${API}
export OPENAI_API_KEY="$ONEROUTER_KEY"

curl ${API}/chat/completions \\
  -H "Authorization: Bearer $ONEROUTER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"onerouter/auto","messages":[{"role":"user","content":"ping"}]}'`
  );

  return (
    <main className="page narrow" id="getkey">
      <section className="page-head">
        <div className="crumbs">
          <a href="/">Get started</a> <span>/</span> <span>Get a key</span>
        </div>
        <h1>Get an API key</h1>
      </section>

      <KeysFlow />

      <h2 className="sec">Then point a client at it</h2>
      <div dangerouslySetInnerHTML={{ __html: snippet }} />
      <p className="note">
        Full walkthrough in the <a href="/docs/quickstart">quickstart</a>; per-client configuration in{" "}
        <a href="/docs/integrations">client setup</a>.
      </p>
    </main>
  );
}
