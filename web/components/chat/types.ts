export interface ChatModel {
  id: string;
  name: string;
  author: string;
  in: number;
  out: number;
  ctx: number;
  free: boolean;
}
