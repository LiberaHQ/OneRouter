import Link from "next/link";
import { Mark } from "./Mark";
import { CopyButton } from "./CopyButton";
import { BRAND, API } from "@/lib/content/nav";

const FOOTER_COLS: Array<[string, Array<[string, string]>]> = [
  [
    "Docs",
    [
      ["Quickstart", "/docs/quickstart"],
      ["Open Tier", "/docs/open-tier"],
      ["Authentication", "/docs/authentication"],
      ["Models", "/docs/models"],
      ["Streaming", "/docs/streaming"],
      ["Errors", "/docs/errors"],
    ],
  ],
  [
    "Operate",
    [
      ["Budgets", "/docs/budgets"],
      ["Failover", "/docs/failover"],
      ["Billing", "/docs/billing"],
      ["Data handling", "/docs/privacy"],
    ],
  ],
  [
    "Build",
    [
      ["Client setup", "/docs/integrations"],
      ["Agent resources", "/docs/agent-resources"],
      ["Model catalog", "/models"],
      ["llms.txt", "/llms.txt"],
    ],
  ],
  [
    "Platform",
    [
      ["Sign in", "/signin"],
      ["Add credit", "/pay"],
      ["Pricing", "/pricing"],
      ["Changelog", "/changelog"],
      ["Support", "/support"],
    ],
  ],
];

export function Footer() {
  return (
    <footer className="foot">
      <div className="foot-in">
        <div>
          <Link className="brand" href="/">
            <Mark />
            <span>{BRAND}</span>
          </Link>
          <p className="blurb">One key for every model. No account, no card, no lock-in.</p>
          <div className="urlchip">
            <code>{API}</code>
            <CopyButton text={API} />
          </div>
        </div>
        {FOOTER_COLS.map(([name, links]) => (
          <div key={name}>
            <h6>{name}</h6>
            <ul>
              {links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="foot-base">
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/refunds">Refunds</Link>
        <Link href="/legal/acceptable-use">Acceptable use</Link>
        <span className="spacer" />
        <span>© 2026 {BRAND}</span>
      </div>
    </footer>
  );
}
