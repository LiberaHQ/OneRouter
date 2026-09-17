import type { MetadataRoute } from "next";
import { SITE } from "@/lib/content/nav";
import { allDocSlugs } from "@/lib/content/docs";
import { allLegalSlugs } from "@/lib/content/pages";
import { loadModels } from "@/lib/content/data";
import { modelUrlPath } from "@/lib/content/modelUrl";

export default function sitemap(): MetadataRoute.Sitemap {
  const urls = [
    "/",
    "/models",
    "/models/auto/free",
    "/pricing",
    "/keys",
    "/pay",
    "/chat",
    "/providers",
    "/changelog",
    "/support",
    "/signin",
    ...loadModels().map((m) => modelUrlPath(m.id)),
    ...allDocSlugs().map((s) => `/docs/${s}`),
    ...allLegalSlugs().map((s) => `/legal/${s}`),
  ];
  return urls.map((u) => ({ url: `${SITE}${u}` }));
}
