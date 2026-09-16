import { STORE } from "@/lib/gateway/store";
import { encodeSvg } from "@/lib/gateway/qr";

// The address as a QR. Encoded then read back before it's served — a QR that doesn't
// decode to the exact address is not one to point a wallet at.
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const deposit = STORE.state.deposits[ref];
  if (!deposit) return new Response("no such deposit", { status: 400 });
  let svg: string;
  try {
    svg = await encodeSvg(deposit.address);
  } catch (err) {
    return new Response(`could not encode the address: ${(err as Error).message}`, { status: 500 });
  }
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" },
  });
}
