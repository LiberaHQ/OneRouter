import * as core from "@/lib/gateway/catalog";

export function GET() {
  const models = core.catalog();
  return Response.json({
    object: "list",
    data: models.map((m) => ({
      id: m.id,
      name: m.name,
      author: m.author,
      context_length: m.context_length,
      max_output: m.max_output,
      pricing: { prompt_per_m: m.per_m.in, completion_per_m: m.per_m.out },
      input_modalities: m.input_modalities,
      hosts: m.hosts,
      tags: m.tags,
    })),
  });
}
