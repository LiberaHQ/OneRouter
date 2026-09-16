export type ChatModel = {
  id: string;
  name: string;
  author: string;
  in: number;
  out: number;
  ctx: number;
  free: boolean;
};

export type Turn = {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  meta?: string;
};

export type Convo = { id: string; title: string; turns: Turn[] };

/** The closing frame the gateway adds to a stream: what the request really cost. */
export type Meter = {
  receipt: string;
  cost_usd: number;
  balance_usd: number;
  ttft_ms: number;
  provider: string;
};
