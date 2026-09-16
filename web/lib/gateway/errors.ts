// Errors are returned in the shape docs/_errors.json documents — loaded from that file
// so the gateway and the published error page cannot drift apart. Ported from
// server.py's error_body()/fail()/fail_msg(). CORS is dropped entirely: frontend and
// gateway are now the same Next.js app (same-origin), unlike the original two-process
// site+gateway split that needed a wildcard Access-Control-Allow-Origin.
import { loadErrors } from "../markdown/directives/errors";
import { SITE, BRAND, API, DOMAIN } from "../content/nav";

export interface ApiErrorBody {
  error: { code: string; type: string; message: string; retryable: boolean };
}

function errorsByCode(): Map<string, ReturnType<typeof loadErrors>[number]> {
  return new Map(loadErrors().map((e) => [e.code, e]));
}

export function errorBody(code: string, detail = ""): { status: number; body: ApiErrorBody } {
  const specs = errorsByCode();
  const spec = specs.get(code) ?? specs.get("internal_error")!;
  let message = spec.message;
  message = message
    .split("{{SITE}}").join(SITE)
    .split("{{BRAND}}").join(BRAND)
    .split("{{API}}").join(API)
    .split("{{DOMAIN}}").join(DOMAIN);
  if (detail) message = `${message} (${detail})`;
  return {
    status: spec.http,
    body: { error: { code, type: spec.type, message, retryable: spec.retryable } },
  };
}

/** Same code and status as the catalog, but this exact message — used where the
 * specific reason is more use than the catalog's general one. */
export function errorBodyWithMessage(code: string, message: string): { status: number; body: ApiErrorBody } {
  const specs = errorsByCode();
  const spec = specs.get(code) ?? specs.get("internal_error")!;
  return {
    status: spec.http,
    body: { error: { code, type: spec.type, message, retryable: spec.retryable } },
  };
}

export function jsonError(code: string, detail = ""): Response {
  const { status, body } = errorBody(code, detail);
  return Response.json(body, { status });
}

export function jsonErrorWithMessage(code: string, message: string): Response {
  const { status, body } = errorBodyWithMessage(code, message);
  return Response.json(body, { status });
}
