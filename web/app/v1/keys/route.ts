import { STORE } from "@/lib/gateway/store";
import { SITE } from "@/lib/content/nav";
import { bearer } from "@/lib/gateway/request";
import { principal } from "@/lib/gateway/authRoutes";

export async function POST(req: Request) {
  // Signed in (session or an existing key) but this device has no local key: issue a
  // fresh one for that same account instead of minting an unrelated anonymous one.
  const token = bearer(req);
  if (token) {
    const acct = principal(req);
    if (acct instanceof Response) return acct;
    const issued = await STORE.issueKeyFor(acct);
    return Response.json(issued, { status: 201 });
  }

  const minted = await STORE.mint();
  const { recovery, ...rest } = minted;
  return Response.json({ ...rest, recovery_url: `${SITE}/r/${recovery.slice(7)}` }, { status: 201 });
}
