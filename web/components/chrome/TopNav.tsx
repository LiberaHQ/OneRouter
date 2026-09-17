import Link from "next/link";
import { Mark } from "./Mark";
import { ThemeToggle } from "./ThemeToggle";
import { RailToggleButton } from "./RailToggleButton";
import { AuthCta } from "./AuthCta";
import { BRAND } from "@/lib/content/nav";

const TOP_NAV: Array<[string, string]> = [
  ["Docs", "/docs/quickstart"],
  ["Models", "/models"],
  ["Pricing", "/pricing"],
];

export function TopNav({ active = "" }: { active?: string }) {
  return (
    <header className="top">
      <div className="top-in">
        <RailToggleButton />
        <Link className="brand" href="/">
          <Mark />
          <span>{BRAND}</span>
        </Link>
        <nav>
          {TOP_NAV.map(([label, href]) => (
            <Link key={href} href={href} aria-current={label.toLowerCase() === active ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <span className="spacer" />
        <div className="right">
          <ThemeToggle />
          <Link className="btn ghost" href="/docs/quickstart">
            Docs
          </Link>
          <AuthCta />
        </div>
      </div>
    </header>
  );
}
