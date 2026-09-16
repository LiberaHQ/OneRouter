import type { Metadata } from 'next';
import BodyClass from '@/components/BodyClass';
import Chat from '@/components/Chat';
import { API, BRAND, models } from '@/lib/site';
import type { ChatModel } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Chat',
  description:
    'Talk to any model in the catalog from the browser, over the same ' +
    'OpenAI-compatible endpoint your code uses.',
};

export default function ChatPage() {
  const catalog = models();
  const rows: ChatModel[] = catalog.map((m) => ({
    id: m.id, name: m.name, author: m.author,
    in: m.per_m.in, out: m.per_m.out, ctx: m.context_length,
    free: m.tags.includes('free'),
  }));
  // A dependable general model to open on, and a dependable free route for the toggle.
  const preferred = rows.find((m) => m.id === 'openai/gpt-4o-mini') ?? rows.find((m) => m.in > 0) ?? rows[0];
  const free = rows.find((m) => m.id === 'openrouter/free') ?? rows.find((m) => m.free) ?? preferred;

  return (
    <>
      <BodyClass name="app-body" />
      <Chat models={rows} api={API} brand={BRAND} defaultId={preferred.id} freeId={free.id} />
    </>
  );
}
