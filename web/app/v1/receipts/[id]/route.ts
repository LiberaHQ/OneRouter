import { requireAccount } from "@/lib/gateway/request";
import { STORE } from "@/lib/gateway/store";
import { jsonError } from "@/lib/gateway/errors";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const acct = requireAccount(req);
  if (acct instanceof Response) return acct;
  const { id } = await params;
  if (!/^rcp_[0-9a-f]+$/.test(id)) return jsonError("unsupported_endpoint", `GET /v1/receipts/${id}`);
  const found = STORE.receipt(id);
  if (!found || found.account !== acct.id) return jsonError("invalid_request", "no such receipt");
  return Response.json(found);
}
