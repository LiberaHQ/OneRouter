import * as core from "@/lib/gateway/catalog";

export function GET() {
  const models = core.catalog();
  const free = models.find((m) => m.tags.includes("free"));
  const paid = models.filter((m) => m.per_m.in > 0);
  const cheapest = paid.length ? paid.reduce((min, m) => (m.per_m.in < min.per_m.in ? m : min), paid[0]) : null;
  return Response.json({
    "onerouter/auto": cheapest?.id ?? null,
    "onerouter/auto:free": free?.id ?? null,
    note: "Resolution is data, not a promise. It can change at any time.",
  });
}
