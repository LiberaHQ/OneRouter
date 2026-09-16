import { TopNav } from "@/components/chrome/TopNav";
import { Footer } from "@/components/chrome/Footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      {children}
      <Footer />
    </>
  );
}
