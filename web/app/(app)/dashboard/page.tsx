import type { Metadata } from "next";
import { loadChangelog } from "@/lib/content/data";
import { BRAND, API } from "@/lib/content/nav";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Overview } from "@/components/dashboard/Overview";

export const metadata: Metadata = {
  title: `Dashboard · ${BRAND}`,
  description: "Account overview: setup progress, usage, billing and what's new.",
  alternates: { canonical: "/dashboard" },
};

export default function DashboardPage() {
  const changelog = loadChangelog();
  return (
    <DashboardShell brand={BRAND}>
      <Overview apiUrl={API} brand={BRAND} changelog={changelog} />
    </DashboardShell>
  );
}
