import type { Metadata } from 'next';
import KeyFlow from '@/components/KeyFlow';
import { Footer, Header } from '@/components/Chrome';

export const metadata: Metadata = {
  title: 'Get an API key',
  description:
    'Create a key without an account, fund it with USDC on Arc, and watch the ' +
    'deposit land. No KYC, no expiry, deposits only.',
};

export default function KeysPage() {
  return (
    <>
      <Header />
      <KeyFlow />
      <Footer />
    </>
  );
}
