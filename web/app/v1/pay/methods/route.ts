import * as arc from "@/lib/gateway/arc";

export function GET() {
  return Response.json({ arc: arc.describe() });
}
