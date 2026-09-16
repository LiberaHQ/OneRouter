import { STORE } from "@/lib/gateway/store";
import { SITE } from "@/lib/content/nav";

export async function POST() {
  const minted = await STORE.mint();
  const { recovery, ...rest } = minted;
  return Response.json({ ...rest, recovery_url: `${SITE}/r/${recovery.slice(7)}` }, { status: 201 });
}
