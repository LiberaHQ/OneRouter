import Link from 'next/link';
import Mark from './Mark';
import ThemeToggle from './ThemeToggle';
import { API, BRAND } from '@/lib/config';

const TOP = [
  ['Docs', '/docs/quickstart'],
  ['Models', '/models'],
  ['Pricing', '/pricing'],
  ['Status', '/status'],
  ['Dashboard', '/dashboard'],
] as const;

const FOOTER: [string, [string, string][]][] = [
  ['Docs', [['Quickstart', '/docs/quickstart'], ['Open Tier', '/docs/open-tier'],
            ['Authentication', '/docs/authentication'], ['Models', '/docs/models'],
            ['Streaming', '/docs/streaming'], ['Errors', '/docs/errors']]],
  ['Operate', [['Budgets', '/docs/budgets'], ['Failover', '/docs/failover'],
               ['Billing', '/docs/billing'], ['Data handling', '/docs/privacy']]],
  ['Build', [['Client setup', '/docs/integrations'], ['Agent resources', '/docs/agent-resources'],
             ['Model catalog', '/models'], ['llms.txt', '/llms.txt']]],
  ['Platform', [['Sign in', '/signin'], ['Dashboard', '/dashboard'],
                ['Add credit', '/pay'], ['Pricing', '/pricing'],
                ['Status', '/status'], ['Changelog', '/changelog'], ['Support', '/support']]],
];

export function Header({ active = '' }: { active?: string }) {
  return (
    <header className="top">
      <div className="top-in">
        <Link className="brand" href="/">
          <Mark />
          <span>{BRAND}</span>
        </Link>
        <nav>
          {TOP.map(([label, href]) => (
            <Link key={href} href={href} {...(label.toLowerCase() === active ? { 'aria-current': 'page' } : {})}>
              {label}
            </Link>
          ))}
        </nav>
        <span className="spacer" />
        <div className="right">
          <ThemeToggle />
          <Link className="btn ghost" href="/docs/quickstart">Docs</Link>
          <Link className="btn primary" href="/signin">Get a key</Link>
        </div>
      </div>
    </header>
  );
}

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
          <div className="urlchip"><code>{API}</code></div>
        </div>
        {FOOTER.map(([name, links]) => (
          <div key={name}>
            <h6>{name}</h6>
            <ul>
              {links.map(([label, href]) => (
                <li key={href}>
                  {href.startsWith('/llms') ? <a href={href}>{label}</a> : <Link href={href}>{label}</Link>}
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
