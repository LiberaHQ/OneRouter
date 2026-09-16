import * as core from "@/lib/gateway/catalog";
import * as engine from "@/lib/gateway/engine";
import { BRAND } from "@/lib/content/nav";
import { DEV_CREDIT } from "@/lib/gateway/config";

export function GET() {
  return Response.json({
    status: "ok",
    brand: BRAND,
    engine: engine.describe(),
    dev_credit: DEV_CREDIT,
    models: core.catalog().length,
  });
}
