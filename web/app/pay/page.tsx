import type { Metadata } from 'next';
import PayFlow from '@/components/PayFlow';
import { Footer, Header } from '@/components/Chrome';
import { BRAND } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Add credit',
  description:
    'Fund a key with USDC on Arc. Every key has its own deposit address, so any ' +
    'amount you send is credited to it.',
};

/** A server shell around the client flow, so the chrome and metadata stay on the
 *  server and the filesystem never reaches the browser bundle. */
export default function PayPage() {
  return (
    <>
      <Header />
      <PayFlow />
      <Footer />
    </>
  );
}
