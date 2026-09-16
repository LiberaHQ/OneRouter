import type { Metadata } from "next";
import { BRAND } from "@/lib/content/nav";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ApiKeys } from "@/components/dashboard/ApiKeys";

export const metadata: Metadata = {
  title: `API Keys · Dashboard · ${BRAND}`,
  alternates: { canonical: "/dashboard/keys" },
};

export default function DashboardKeysPage() {
  return (
    <DashboardShell brand={BRAND}>
      <ApiKeys />
    </DashboardShell>
  );
}
