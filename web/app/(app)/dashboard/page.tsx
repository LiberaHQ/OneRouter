import type { Metadata } from "next";
import { BRAND, API } from "@/lib/content/nav";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Overview } from "@/components/dashboard/Overview";

export const metadata: Metadata = {
  title: `Dashboard · ${BRAND}`,
  description: "Account overview: setup progress and usage.",
  alternates: { canonical: "/dashboard" },
};

export default function DashboardPage() {
  return (
    <DashboardShell brand={BRAND}>
      <Overview apiUrl={API} brand={BRAND} />
    </DashboardShell>
  );
}
