import type { Metadata } from "next";
import { loadModels } from "@/lib/content/data";
import { BRAND } from "@/lib/content/nav";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ModelCatalog } from "@/components/catalog/ModelCatalog";

export const metadata: Metadata = {
  title: `Models · Dashboard · ${BRAND}`,
  alternates: { canonical: "/dashboard/models" },
};

export default function DashboardModelsPage() {
  const models = loadModels();
  return (
    <DashboardShell brand={BRAND}>
      <h1>Models</h1>
      <p className="dash-sub">Copy a model ID into your client.</p>
      <ModelCatalog models={models} showLabel={false} />
    </DashboardShell>
  );
}
