import Link from 'next/link';
import type { Metadata } from 'next';
import { NavPublic } from '@/components/nav/NavPublic';
import { BlogFooter } from '@/components/nav/BlogFooter';
import {
  BRANDON_KAPP_LINKEDIN_URL,
  BRANDON_KAPP_META_DESCRIPTION,
  BRANDON_KAPP_NAME,
  BRANDON_KAPP_PAGE_TITLE,
  BRANDON_KAPP_PROFILE_PARAGRAPHS,
  BRANDON_KAPP_PROFILE_PATH,
  BRANDON_KAPP_PUBLIC_CONTACT_EMAIL,
  BRANDON_KAPP_SUBHEAD,
} from '@/lib/brandon-kapp-profile';
import { resolveCanonicalSiteOrigin } from '@/lib/site-canonical';

const siteOrigin = resolveCanonicalSiteOrigin();
const canonicalUrl = `${siteOrigin}${BRANDON_KAPP_PROFILE_PATH}`;

export const metadata: Metadata = {
  title: { absolute: BRANDON_KAPP_PAGE_TITLE },
  description: BRANDON_KAPP_META_DESCRIPTION,
  alternates: { canonical: BRANDON_KAPP_PROFILE_PATH },
  openGraph: {
    title: BRANDON_KAPP_PAGE_TITLE,
    description: BRANDON_KAPP_META_DESCRIPTION,
    url: canonicalUrl,
    siteName: 'Foldera',
    locale: 'en_US',
    type: 'website',
    images: [{ url: `${siteOrigin}/foldera-logo.png`, width: 1200, height: 630, alt: 'Foldera' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: BRANDON_KAPP_PAGE_TITLE,
    description: BRANDON_KAPP_META_DESCRIPTION,
    images: [`${siteOrigin}/foldera-logo.png`],
  },
};

const profileLinks = [
  { href: BRANDON_KAPP_LINKEDIN_URL, label: 'LinkedIn', external: true },
  { href: '/', label: 'Foldera Home', external: false },
  { href: `mailto:${BRANDON_KAPP_PUBLIC_CONTACT_EMAIL}`, label: BRANDON_KAPP_PUBLIC_CONTACT_EMAIL, external: true },
] as const;

export default function BrandonKappPage() {
  return (
    <div className="bg-bg text-text-primary">
      <NavPublic scrolled platformHref="/#product" />
      <main id="main" className="pt-24 sm:pt-32">
        <section className="pb-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <article className="rounded-card border border-border bg-panel p-8 sm:p-8">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Founder profile</p>
              <h1 className="mt-4 text-5xl font-black tracking-tight sm:text-6xl">{BRANDON_KAPP_NAME}</h1>
              <p className="mt-4 text-sm font-black uppercase tracking-[0.12em] text-text-secondary">{BRANDON_KAPP_SUBHEAD}</p>
              <div className="mt-8 space-y-4 text-base leading-relaxed text-text-secondary">
                {BRANDON_KAPP_PROFILE_PARAGRAPHS.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {profileLinks.map((link) =>
                  link.external ? (
                    <a
                      key={link.href}
                      href={link.href}
                      target={link.href.startsWith('mailto:') ? undefined : '_blank'}
                      rel={link.href.startsWith('mailto:') ? undefined : 'noreferrer'}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-button border border-border px-4 text-xs font-black uppercase tracking-[0.14em] text-text-primary transition-colors hover:border-border-strong"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-button border border-border px-4 text-xs font-black uppercase tracking-[0.14em] text-text-primary transition-colors hover:border-border-strong"
                    >
                      {link.label}
                    </Link>
                  ),
                )}
              </div>
            </article>
          </div>
        </section>

        <BlogFooter />
      </main>
    </div>
  );
}

