import { readJson, bearer } from "@/lib/gateway/request";
import { jsonError } from "@/lib/gateway/errors";
import { handleCompletions, fromAnthropic } from "@/lib/gateway/completions";

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body === null) return jsonError("invalid_request", "the request body is not valid JSON");
  return handleCompletions(fromAnthropic(body), bearer(req), "anthropic");
}
