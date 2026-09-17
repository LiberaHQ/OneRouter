import { STORE } from "@/lib/gateway/store";
import { SITE } from "@/lib/content/nav";
import { bearer } from "@/lib/gateway/request";
import { principal } from "@/lib/gateway/authRoutes";

export async function POST(req: Request) {
  // A signed-in account always gets its existing database-backed key. Legacy
  // accounts without a retrievable key receive exactly one replacement.
  const token = bearer(req);
  if (token) {
    const acct = principal(req);
    if (acct instanceof Response) return acct;
    const issued = await STORE.keyFor(acct);
    return Response.json(issued, { status: 201 });
  }

  const minted = await STORE.mint();
  const { recovery, ...rest } = minted;
  return Response.json({ ...rest, recovery_url: `${SITE}/r/${recovery.slice(7)}` }, { status: 201 });
}
