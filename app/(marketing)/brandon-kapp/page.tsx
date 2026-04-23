import Link from 'next/link';
import type { Metadata } from 'next';
import { BlogFooter } from '@/components/nav/BlogFooter';
import { NavPublic } from '@/components/nav/NavPublic';
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
  title: {
    absolute: BRANDON_KAPP_PAGE_TITLE,
  },
  description: BRANDON_KAPP_META_DESCRIPTION,
  alternates: {
    canonical: BRANDON_KAPP_PROFILE_PATH,
  },
  openGraph: {
    title: BRANDON_KAPP_PAGE_TITLE,
    description: BRANDON_KAPP_META_DESCRIPTION,
    url: canonicalUrl,
    siteName: 'Foldera',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: `${siteOrigin}/foldera-logo.png`,
        width: 1200,
        height: 630,
        alt: 'Foldera',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: BRANDON_KAPP_PAGE_TITLE,
    description: BRANDON_KAPP_META_DESCRIPTION,
    images: [`${siteOrigin}/foldera-logo.png`],
  },
};

const profileLinks = [
  {
    href: BRANDON_KAPP_LINKEDIN_URL,
    label: 'LinkedIn',
    external: true,
  },
  {
    href: '/',
    label: 'Foldera Home',
    external: false,
  },
  {
    href: `mailto:${BRANDON_KAPP_PUBLIC_CONTACT_EMAIL}`,
    label: BRANDON_KAPP_PUBLIC_CONTACT_EMAIL,
    external: true,
  },
] as const;

export default function BrandonKappPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#07070c] text-white antialiased selection:bg-cyan-500/30 selection:text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]" />
      </div>

      <NavPublic scrolled platformHref="/#product" />

      <main id="main" className="relative z-10 px-4 pb-12 pt-24 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/80 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-10 lg:p-12">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">Founder Profile</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">{BRANDON_KAPP_NAME}</h1>
            <p className="mt-4 max-w-3xl text-sm font-medium uppercase tracking-[0.18em] text-zinc-400 sm:text-[13px]">
              {BRANDON_KAPP_SUBHEAD}
            </p>

            <div className="mt-8 h-px bg-white/10" />

            <div className="mt-8 space-y-6 text-base leading-8 text-zinc-300 sm:text-lg">
              {BRANDON_KAPP_PROFILE_PARAGRAPHS.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {profileLinks.map((link) =>
                link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    target={link.href.startsWith('mailto:') ? undefined : '_blank'}
                    rel={link.href.startsWith('mailto:') ? undefined : 'noreferrer'}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-200 transition-all hover:border-cyan-400/40 hover:text-white"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-200 transition-all hover:border-cyan-400/40 hover:text-white"
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </div>
          </section>

          <BlogFooter />
        </div>
      </main>
    </div>
  );
}
