'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Brain,
  CalendarDays,
  CheckCircle2,
  Database,
  FileText,
  Layers3,
  LockKeyhole,
  Mail,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { NavPublic } from '@/components/nav/NavPublic';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';

const briefDraft = `Hi Alex —

Following up on the update from yesterday.
I pulled the latest status and can send the finalized version by noon unless you want one adjustment first.

Best,
Brandon`;

const heroFeatures = [
  {
    icon: Mail,
    title: 'Executive briefing',
    body: 'One daily brief with the move that matters.',
  },
  {
    icon: Zap,
    title: 'Ready-to-send drafts',
    body: 'Context-rich wording you can approve or adjust.',
  },
  {
    icon: ShieldCheck,
    title: 'Source-grounded',
    body: 'Every recommendation points back to the evidence.',
  },
];

const trustItems = [
  {
    icon: Layers3,
    title: 'Source-grounded drafts',
    body: 'The brief is built from connected context, not a blank prompt.',
  },
  {
    icon: CheckCircle2,
    title: 'Approval before send',
    body: 'Foldera prepares the move. You stay in control.',
  },
  {
    icon: Database,
    title: 'Connected context',
    body: 'Inbox, calendar, and document signals stay tied to the recommendation.',
  },
  {
    icon: LockKeyhole,
    title: 'Audit trail by default',
    body: 'Every brief keeps the reasoning and source basis visible.',
  },
];

const howItWorks = [
  {
    icon: CalendarDays,
    title: '1. Connect your world',
    body: 'Foldera reads approved inbox, calendar, and document context so the system sees the work around you.',
  },
  {
    icon: Brain,
    title: '2. Foldera builds your brief',
    body: 'It finds the highest-leverage open loop and prepares the directive, reasoning, draft, and source trail.',
  },
  {
    icon: Send,
    title: '3. You approve the move',
    body: 'Review, adjust, snooze, or send with confidence.',
  },
];

const capabilityCards = [
  {
    icon: Send,
    title: 'Executive Briefing',
    body: 'One daily brief that shows the highest-impact move and why it matters now.',
  },
  {
    icon: FileText,
    title: 'Ready-to-send drafts',
    body: 'Context-rich wording you can approve in seconds instead of starting from scratch.',
  },
  {
    icon: Layers3,
    title: 'Source-grounded decisions',
    body: 'Every recommendation carries the thread, hold, draft, or signal behind it.',
  },
  {
    icon: ShieldCheck,
    title: 'Approval before send',
    body: 'Nothing moves without your review. Foldera prepares the work; you decide.',
  },
];

const integrationItems = ['Gmail', 'Google Calendar', 'Microsoft 365', 'Docs', 'Storage', 'More coming soon'];

function HeroFeatureList() {
  return (
    <div className="mt-9 space-y-4">
      {heroFeatures.map((item) => {
        const Icon = item.icon;
        return (
          <article key={item.title} className="grid grid-cols-[48px_minmax(0,1fr)] gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#22D3EE]/35 bg-[#07131A] text-[#22D3EE] shadow-[0_0_24px_rgba(34,211,238,0.12)]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-[#F3F7FA]">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-[#8D9AA8]">{item.body}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ProductMockup() {
  return (
    <div
      className="relative overflow-hidden rounded-[30px] border border-[#0EA5E9]/55 bg-[#04080D] shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_0_64px_rgba(34,211,238,0.14)]"
      id="example-brief"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#22D3EE] to-transparent opacity-80" />
      <div className="pointer-events-none absolute -right-24 top-8 h-72 w-72 rounded-full bg-[#22D3EE]/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-[#7C3AED]/10 blur-3xl" />

      <div className="relative grid min-h-[620px] xl:grid-cols-[220px_minmax(0,1fr)_220px]">
        <aside className="hidden border-r border-[#1B2530]/80 bg-[#061018]/80 p-6 xl:flex xl:flex-col">
          <FolderaLogo href="/" markSize="sm" />
          <nav className="mt-8 space-y-2 text-sm text-[#9AA7B6]">
            {['Executive Briefing', 'Playbooks', 'Signals', 'Audit Log', 'Integrations', 'Settings'].map((item, index) => (
              <div
                key={item}
                className={`rounded-[12px] px-3 py-2.5 ${
                  index === 0
                    ? 'border border-[#22D3EE]/25 bg-white/[0.06] text-white'
                    : 'text-[#8D9AA8]'
                }`}
              >
                {item}
              </div>
            ))}
          </nav>

          <div className="mt-auto space-y-4">
            <div className="rounded-[16px] border border-[#1B2530] bg-[#0B121A] p-4">
              <p className="text-sm font-semibold text-[#22D3EE]">Upgrade to Pro</p>
              <p className="mt-2 text-xs leading-5 text-[#8D9AA8]">Unlock team features, custom playbooks, and integrations.</p>
            </div>
            <div className="rounded-[16px] border border-[#1B2530] bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">Brandon</p>
              <p className="mt-1 text-xs text-[#7A8594]">Workspace Owner</p>
            </div>
          </div>
        </aside>

        <section className="min-w-0 p-5 sm:p-7 xl:p-8">
          <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#9AA7B6]">Thursday, April 23</p>
              <h2 className="mt-5 text-[30px] font-semibold leading-tight tracking-[-0.05em] text-white sm:text-[40px]">
                Good evening, Brandon.
              </h2>
              <div className="mt-4 flex flex-wrap gap-5 text-sm text-[#A7B3C2]">
                <span><strong className="text-2xl text-white">5</strong> open threads</span>
                <span><strong className="text-2xl text-[#F59E0B]">2</strong> need attention</span>
                <span><strong className="text-2xl text-white">1</strong> ready to move</span>
              </div>
            </div>

            <div className="hidden min-w-[260px] items-center rounded-[14px] border border-[#1B2530] bg-[#071018] px-4 py-3 text-sm text-[#7A8594] md:flex">
              Search Foldera...
              <span className="ml-auto rounded-[8px] border border-[#1B2530] px-2 py-1 text-xs">⌘K</span>
            </div>
          </header>

          <div className="mt-8">
            <DailyBriefCard
              className="shadow-[0_0_54px_rgba(34,211,238,0.18)]"
              directive="Send the follow-up to Alex Morgan before noon."
              whyNow="You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar makes this the cleanest unblocker today."
              draftBody={<div className="whitespace-pre-line">{briefDraft}</div>}
              sourcePills={['Email thread', 'Calendar hold', 'Last draft', 'Connected inbox']}
              nextStep="Next: Await response"
              actions={[
                { label: 'Copy draft', kind: 'secondary' },
                { label: 'Snooze 24h', kind: 'amber' },
                { label: 'Approve & send', kind: 'primary' },
              ]}
            />
          </div>
        </section>

        <aside className="hidden border-l border-[#1B2530]/80 bg-[#050B10]/70 p-6 xl:block">
          <div className="rounded-[18px] border border-[#1B2530] bg-[#080F16] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#9AA7B6]">How this brief works</p>
              <span className="text-xs text-[#7A8594]">Learn more →</span>
            </div>
            <div className="mt-6 space-y-5">
              {[
                ['Directive', 'The single move that matters most right now.'],
                ['Draft', 'Ready-to-send wording when writing is the bottleneck.'],
                ['Source trail', 'The evidence behind the recommendation.'],
              ].map(([title, body]) => (
                <div key={title} className="border-t border-[#1B2530] pt-5">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-2 text-xs leading-5 text-[#8D9AA8]">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-[18px] border border-[#1B2530] bg-[#080F16] p-5">
            <div className="rounded-[16px] border border-dashed border-[#2A3644] bg-[#111922] px-5 py-10 text-center">
              <p className="font-semibold text-white">Drop a folder or document.</p>
              <p className="mt-2 text-sm leading-6 text-[#8D9AA8]">Foldera will get to work instantly.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TrustStrip() {
  return (
    <section className="grid gap-4 rounded-[22px] border border-[#1B2530] bg-[#071018]/90 p-4 shadow-[0_0_44px_rgba(34,211,238,0.08)] md:grid-cols-4">
      {trustItems.map((item) => {
        const Icon = item.icon;
        return (
          <article key={item.title} className="border-[#1B2530] p-3 md:border-r md:last:border-r-0">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[12px] text-[#22D3EE]">
              <Icon className="h-7 w-7" aria-hidden="true" />
            </div>
            <h3 className="text-[15px] font-semibold text-white">{item.title}</h3>
            <p className="mt-1 text-sm leading-6 text-[#8D9AA8]">{item.body}</p>
          </article>
        );
      })}
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-12 sm:py-16">
      <div className="text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#22D3EE]">How it works</p>
        <h2 className="mt-3 text-[32px] font-semibold tracking-[-0.04em] text-white sm:text-[42px]">
          From chaos to clarity in 3 steps
        </h2>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-3">
        {howItWorks.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title} className="relative rounded-[22px] border border-[#1B2530] bg-[#071018]/70 p-7 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#22D3EE]/35 bg-[#07131A] text-[#22D3EE] shadow-[0_0_36px_rgba(34,211,238,0.16)]">
                <Icon className="h-7 w-7" aria-hidden="true" />
              </div>
              <h3 className="mt-6 text-lg font-semibold tracking-[-0.02em] text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#9AA7B6]">{item.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CapabilitiesSection() {
  return (
    <section id="product" className="py-12 sm:py-16">
      <div className="text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#22D3EE]">Built for leaders who move fast</p>
        <h2 className="mt-3 text-[32px] font-semibold tracking-[-0.04em] text-white sm:text-[42px]">
          Everything you need. Nothing you don’t.
        </h2>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {capabilityCards.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title} className="rounded-[22px] border border-[#1B2530] bg-[#071018]/80 p-7">
              <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#22D3EE]/25 bg-[#07131A] text-[#22D3EE]">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#9AA7B6]">{item.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function IntegrationsSection() {
  return (
    <section id="integrations" className="rounded-[24px] border border-[#1B2530] bg-[#060C12] px-6 py-9 sm:px-8">
      <p className="text-center text-[11px] font-black uppercase tracking-[0.22em] text-[#22D3EE]">
        Integrates with the tools you already use
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {integrationItems.map((item) => (
          <span
            key={item}
            className="rounded-full border border-[#1B2530] bg-[#0B121A] px-5 py-3 text-sm font-medium text-[#D8E0E8]"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="rounded-[26px] border border-[#22D3EE]/35 bg-gradient-to-r from-[#06222D] via-[#071018] to-[#071018] px-6 py-8 shadow-[0_0_54px_rgba(34,211,238,0.14)] sm:px-8 lg:flex lg:items-center lg:justify-between">
      <div>
        <h2 className="text-[28px] font-semibold tracking-[-0.04em] text-white sm:text-[34px]">
          Ready to lead with clarity?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-[#A7B3C2]">
          Start with one connected workspace. Foldera finds the next move, explains why it matters, and prepares the action.
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0">
        <a
          href="/start"
          className="inline-flex min-h-[52px] items-center justify-center gap-3 rounded-[12px] bg-[#22D3EE] px-7 text-sm font-bold text-[#031016] shadow-[0_0_34px_rgba(34,211,238,0.35)] transition hover:bg-[#67E8F9]"
        >
          Start free <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
        <a
          href="/pricing"
          className="inline-flex min-h-[52px] items-center justify-center rounded-[12px] border border-[#2A3644] px-7 text-sm font-semibold text-white transition hover:border-[#22D3EE]/60"
        >
          View pricing
        </a>
      </div>
    </section>
  );
}

function LandingFooter() {
  const product = [
    { label: 'Executive Briefing', href: '/#example-brief' },
    { label: 'Playbooks', href: '/#product' },
    { label: 'Signals', href: '/#how-it-works' },
    { label: 'Integrations', href: '/#integrations' },
    { label: 'Pricing', href: '/pricing' },
  ];
  const resources = [
    { label: 'Blog', href: '/blog' },
    { label: 'Help Center', href: '/start' },
    { label: 'Templates', href: '/#example-brief' },
    { label: 'What’s New', href: '/blog' },
    { label: 'Status', href: '/status' },
  ];
  const company = [
    { label: 'About', href: '/about' },
    { label: 'Security', href: '/security' },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Contact', href: 'mailto:support@foldera.ai' },
  ];

  return (
    <footer className="border-t border-[#1B2530] py-10">
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr]">
        <div>
          <FolderaLogo href="/" markSize="md" />
          <p className="mt-5 max-w-xs text-sm leading-7 text-[#9AA7B6]">
            Executive clarity. Delivered daily.
          </p>
        </div>

        <FooterColumn title="Product" items={product} />
        <FooterColumn title="Resources" items={resources} />
        <FooterColumn title="Company" items={company} />

        <div>
          <h3 className="text-sm font-semibold text-white">Stay ahead</h3>
          <p className="mt-4 text-sm leading-7 text-[#9AA7B6]">
            Notes on leadership, productivity, and source-grounded work.
          </p>
          <form className="mt-5 flex gap-2">
            <input
              type="email"
              placeholder="Enter your email"
              className="min-h-[46px] min-w-0 flex-1 rounded-[12px] border border-[#1B2530] bg-[#071018] px-4 text-sm text-white outline-none placeholder:text-[#5F6B79] focus:border-[#22D3EE]/60"
            />
            <button
              type="button"
              className="rounded-[12px] bg-[#22D3EE] px-4 text-sm font-semibold text-[#031016]"
            >
              Subscribe
            </button>
          </form>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-4 border-t border-[#1B2530] pt-6 text-sm text-[#7A8594] sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 Foldera, Inc. All rights reserved.</p>
        <div className="flex flex-wrap gap-5">
          <a href="/privacy" className="hover:text-white">Privacy</a>
          <a href="/terms" className="hover:text-white">Terms</a>
          <a href="/status" className="hover:text-white">Status</a>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; href: string }>;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-4 space-y-3 text-sm text-[#9AA7B6]">
        {items.map((item) => (
          <li key={item.label}>
            <a href={item.href} className="transition hover:text-white">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HomePageClient() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#03070B] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_74%_10%,rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_16%_22%,rgba(124,58,237,0.10),transparent_25%),linear-gradient(180deg,#03070B_0%,#05080D_45%,#03070B_100%)]" />
      <NavPublic scrolled={scrolled} platformHref="#product" />

      <main id="main" className="relative">
        <section className="mx-auto max-w-[1720px] px-4 pb-8 pt-24 sm:px-6 lg:px-10 lg:pt-28">
          <div className="rounded-[34px] border border-[#163241] bg-[#03070B]/80 p-4 shadow-[0_0_0_1px_rgba(34,211,238,0.10),0_0_80px_rgba(34,211,238,0.08)] sm:p-8 lg:p-10">
            <div className="mx-auto mb-10 flex w-fit items-center gap-2 rounded-full border border-[#22D3EE]/30 bg-[#07131A] px-4 py-2 text-sm text-[#C9D5E2]">
              <Sparkles className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
              <span className="font-semibold text-[#22D3EE]">New:</span>
              <span>Executive Briefing is live.</span>
              <ArrowRight className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
            </div>

            <div className="grid gap-12 xl:grid-cols-[minmax(360px,0.42fr)_minmax(0,0.58fr)] xl:items-center">
              <div className="max-w-[560px]">
                <div className="inline-flex items-center gap-3 rounded-full border border-[#22D3EE]/25 bg-[#07131A] px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#D8F8FF]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#22D3EE] shadow-[0_0_16px_rgba(34,211,238,0.9)]" />
                  Your executive assistant
                </div>

                <h1 className="mt-8 text-[64px] font-semibold leading-[0.95] tracking-[-0.07em] text-white sm:text-[86px] lg:text-[96px]">
                  Brief less.
                  <br />
                  <span className="bg-gradient-to-b from-[#D8FBFF] to-[#22D3EE] bg-clip-text text-transparent">
                    Do more.
                  </span>
                </h1>

                <p className="mt-7 max-w-[560px] text-[18px] leading-8 text-[#A7B3C2] sm:text-[20px]">
                  Foldera turns scattered inboxes, calendar holds, stale drafts, and unresolved threads into one
                  ready-to-send executive brief.
                </p>

                <HeroFeatureList />

                <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                  <a
                    href="/start"
                    className="inline-flex min-h-[58px] items-center justify-center gap-3 rounded-[14px] bg-[#22D3EE] px-8 text-[15px] font-bold text-[#031016] shadow-[0_0_38px_rgba(34,211,238,0.38)] transition hover:bg-[#67E8F9]"
                  >
                    Get started — it’s free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                  <a
                    href="#example-brief"
                    className="inline-flex min-h-[58px] items-center justify-center rounded-[14px] border border-[#2A3644] bg-[#050A0F] px-8 text-[15px] font-semibold text-white transition hover:border-[#22D3EE]/50"
                  >
                    See example brief
                  </a>
                </div>

                <div className="mt-6 flex flex-wrap gap-5 text-sm text-[#9AA7B6]">
                  {['No credit card required', 'Approval before send', 'Connected sources stay in your control'].map((item) => (
                    <span key={item} className="inline-flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <ProductMockup />
            </div>

            <div className="mt-10">
              <TrustStrip />
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-10">
          <HowItWorksSection />
          <CapabilitiesSection />
          <IntegrationsSection />
          <div className="py-12 sm:py-16">
            <FinalCta />
          </div>
          <LandingFooter />
        </div>
      </main>
    </div>
  );
}
