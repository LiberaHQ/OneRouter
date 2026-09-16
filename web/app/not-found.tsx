import { TopNav } from "@/components/chrome/TopNav";
import { Footer } from "@/components/chrome/Footer";
import { NotFoundBody } from "@/components/content/NotFoundBody";

// Root-level fallback for paths that don't match any segment at all (so no nested
// layout — and thus no chrome — would otherwise wrap them).
export default function RootNotFound() {
  return (
    <>
      <TopNav />
      <NotFoundBody />
      <Footer />
    </>
  );
}
