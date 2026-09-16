import type { Metadata } from "next";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme/themeScript";
import { BRAND, NAV, SITE } from "@/lib/content/nav";
import { ContentInteractions } from "@/components/content/ContentInteractions";

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23F2A93B'/%3E%3Cg transform='translate(4 4)' fill='none' stroke='%230C0D10' stroke-width='2.1' stroke-linecap='round'%3E%3Cpath d='M5.95 12H17.75'/%3E%3Cpath d='M12.8 12c3.69 0 3.69-6 4.95-6'/%3E%3Cpath d='M12.8 12c3.69 0 3.69 6 4.95 6'/%3E%3Ccircle cx='4.2' cy='12' r='1.75' fill='%230C0D10' stroke='none'/%3E%3Ccircle cx='19.5' cy='6' r='1.75' fill='%230C0D10' stroke='none'/%3E%3Ccircle cx='19.5' cy='12' r='1.75' fill='%230C0D10' stroke='none'/%3E%3Ccircle cx='19.5' cy='18' r='1.75' fill='%230C0D10' stroke='none'/%3E%3C/g%3E%3C/svg%3E";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  // No title template: every page (matching the original site) sets its own
  // complete literal title string, so a template here would double up the brand.
  title: BRAND,
  description: NAV.tagline,
  icons: { icon: FAVICON },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <ContentInteractions />
      </body>
    </html>
  );
}
