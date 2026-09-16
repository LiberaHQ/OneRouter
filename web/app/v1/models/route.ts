import * as core from "@/lib/gateway/catalog";
import { requireAccount } from "@/lib/gateway/request";

export function GET(req: Request) {
  const acct = requireAccount(req);
  if (acct instanceof Response) return acct;
  const models = core.catalog();
  return Response.json({
    object: "list",
    data: models.map((m) => ({ id: m.id, object: "model", created: 0, owned_by: m.author })),
  });
}
