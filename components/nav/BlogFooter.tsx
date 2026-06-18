import { FolderaMark } from '@/components/nav/FolderaMark';

type FooterLink = { href: string; label: string };

const columns: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: 'Product',
    links: [
      { href: '/#how-foldera-works', label: 'How it works' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/try', label: 'Try it' },
      { href: '/demo', label: 'Demo' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/security', label: 'Security' },
      { href: '/login', label: 'Sign in' },
      { href: '/start', label: 'Start free' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
      { href: '/status', label: 'Status' },
    ],
  },
];

/**
 * Shared site footer — premium multi-column layout used across every public
 * page (and the blog). Matches the landing footer's structure so the whole
 * site reads as one system. Server component (static).
 */
export function BlogFooter() {
  return (
    <footer className="mt-20 border-t border-border-subtle px-5 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <a href="/" aria-label="Foldera" className="inline-flex items-center gap-2.5">
            <FolderaMark size="sm" decorative />
            <span className="text-[16px] font-semibold tracking-[-0.025em] text-text-primary">Foldera</span>
          </a>
          <p className="mt-4 max-w-xs font-mono text-[12px] uppercase leading-5 tracking-[0.14em] text-text-muted">
            The Workday Presence Layer.
          </p>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">{col.title}</p>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-[14px] text-text-secondary transition-colors hover:text-text-primary"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-12 flex w-full max-w-6xl flex-col gap-2 border-t border-border-subtle pt-6 text-[12px] text-text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>&copy; {new Date().getFullYear()} Foldera. All rights reserved.</span>
        <span className="font-mono uppercase tracking-[0.14em]">Consent-first · No surveillance · Quiet by design</span>
      </div>
    </footer>
  );
}
