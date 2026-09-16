import type { Metadata } from 'next';
import SignIn from '@/components/SignIn';
import { API, BRAND } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in with an email or an Arc wallet. No profile, no account to fill in.',
};

export default function SignInPage() {
  return <SignIn api={API} brand={BRAND} />;
}
