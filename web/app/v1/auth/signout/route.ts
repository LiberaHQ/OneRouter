import { bearer } from "@/lib/gateway/request";
import { STORE } from "@/lib/gateway/store";

export async function POST(req: Request) {
  await STORE.closeSession(bearer(req));
  return Response.json({ signed_out: true });
}
