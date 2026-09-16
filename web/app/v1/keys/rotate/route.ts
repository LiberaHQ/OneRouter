import { STORE } from "@/lib/gateway/store";
import { readJson } from "@/lib/gateway/request";
import { jsonError } from "@/lib/gateway/errors";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body === null) return jsonError("invalid_request", "the request body is not valid JSON");
  const rotated = await STORE.rotate(String(body.recovery ?? ""));
  if (!rotated) return jsonError("invalid_api_key", "recovery secret not recognised");
  return Response.json(rotated);
}
