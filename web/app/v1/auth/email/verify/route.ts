import { readJson } from "@/lib/gateway/request";
import { jsonError } from "@/lib/gateway/errors";
import { checkCode, signedIn } from "@/lib/gateway/authRoutes";
import { STORE } from "@/lib/gateway/store";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body === null) return jsonError("invalid_request", "the request body is not valid JSON");
  const row = await checkCode(body);
  if (row instanceof Response) return row;
  const [acct, minted] = await STORE.signIn(`email:${row.email}`);
  return signedIn(acct, minted, { label: row.email });
}
