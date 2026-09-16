import type { Metadata } from 'next';
import './globals.css';
import { BRAND, SITE, nav } from '@/lib/site';

export const metadata: Metadata = {
  title: { default: `${BRAND} — ${nav.tagline}`, template: `%s · ${BRAND}` },
  description:
    'An OpenAI-compatible LLM gateway: one prepaid key reaches every model in the ' +
    'catalog, with same-model host failover and no account requirement.',
  metadataBase: new URL(SITE),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        {/* Applied before first paint so a light-mode reader never sees a dark flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('or-theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
