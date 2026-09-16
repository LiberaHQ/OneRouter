import { jsonErrorWithMessage } from "@/lib/gateway/errors";

export function POST() {
  return jsonErrorWithMessage(
    "unsupported_endpoint",
    "/v1/responses is documented but not implemented in this build. Use /v1/chat/completions, or /v1/messages for the Anthropic shape."
  );
}
