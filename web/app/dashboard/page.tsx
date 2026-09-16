import type { Metadata } from 'next';
import Dashboard from '@/components/Dashboard';
import { Footer, Header } from '@/components/Chrome';
import { API } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Dashboard',
  description:
    'Credit remaining, spend by model, free-tier allowance and recent requests for ' +
    'one key.',
};

export default function DashboardPage() {
  return (
    <>
      <Header />
      <Dashboard api={API} />
      <Footer />
    </>
  );
}
