// Model catalog resolution and pricing. Ported from the bottom of gateway/core.py.
import { loadModels, type Model } from "../content/data";

export function catalog(): Model[] {
  return loadModels();
}

export function byId(models: Model[]): Map<string, Model> {
  return new Map(models.map((m) => [m.id, m]));
}

/** "onerouter/auto" picks the cheapest paid route; ":free" the free one. Anything else
 * has to be a catalog id — the router never silently substitutes a model. */
export function resolveModel(models: Model[], wanted: string): Model | null {
  const index = byId(models);
  if (index.has(wanted)) return index.get(wanted)!;
  if (wanted === "onerouter/auto:free" || wanted === "auto:free") {
    // A named preference first: "whichever free model sorts first" picked a narrow
    // code model that answered with nothing.
    const preferred = process.env.ONEROUTER_FREE_MODEL || "openrouter/free";
    if (index.has(preferred)) return index.get(preferred)!;
    return models.find((m) => m.tags.includes("free")) ?? null;
  }
  if (wanted === "onerouter/auto" || wanted === "auto") {
    const paid = models.filter((m) => m.per_m.in > 0);
    if (!paid.length) return null;
    return paid.reduce((min, m) => (m.per_m.in < min.per_m.in ? m : min), paid[0]);
  }
  return null;
}

export function price(model: Model, promptTokens: number, completionTokens: number): number {
  const per = model.per_m;
  const raw = (promptTokens * per.in) / 1e6 + (completionTokens * per.out) / 1e6;
  return Math.round(raw * 1e8) / 1e8;
}
