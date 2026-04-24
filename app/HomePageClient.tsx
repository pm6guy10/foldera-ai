'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, FileText, Layers3, Mail, Radar, Shield, Sparkles } from 'lucide-react';
import { NavPublic } from '@/components/nav/NavPublic';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { MarketingDesignPanel } from '@/components/foldera/MarketingDesignPanel';
import { ProductPreviewPanel } from '@/components/foldera/ProductPreviewPanel';

const howItWorks = [
  {
    icon: Radar,
    title: 'Connect your sources',
    body: 'Foldera reads your email, calendar, and other approved context.',
  },
  {
    icon: Sparkles,
    title: 'It finds the real blocker',
    body: 'Not the loudest task — the one that actually moves the outcome.',
  },
  {
    icon: Shield,
    title: 'You get a finished move',
    body: 'A directive, draft, and source trail you can use immediately.',
  },
];

const briefRows = [
  {
    icon: Mail,
    title: 'Directive',
    body: 'The single move that matters most right now.',
  },
  {
    icon: FileText,
    title: 'Draft',
    body: 'Ready-to-send wording when writing is the bottleneck.',
  },
  {
    icon: Layers3,
    title: 'Source trail',
    body: 'The evidence behind the recommendation.',
  },
];

function LandingFooter() {
  return (
    <footer className="border-t border-border pt-8" id="about">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <FolderaLogo href="/" markSize="sm" />
          <p className="mt-2 text-sm text-text-muted">Executive clarity. Delivered daily.</p>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm text-text-muted">
          <a href="/#product" className="hover:text-text-primary">
            Platform
          </a>
          <a href="/pricing" className="hover:text-text-primary">
            Pricing
          </a>
          <a href="/blog" className="hover:text-text-primary">
            Blog
          </a>
          <a href="/#security" className="hover:text-text-primary">
            Security
          </a>
          <a href="/#about" className="hover:text-text-primary">
            About
          </a>
          <span className="text-text-muted/70">© 2026 Foldera, Inc.</span>
        </div>
      </div>
    </footer>
  );
}

export default function HomePageClient() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="foldera-page min-h-screen bg-bg text-text-primary">
      <NavPublic scrolled={scrolled} platformHref="#product" />

      <main id="main" className="relative">
        <section className="mx-auto max-w-[1600px] px-4 pb-16 pt-24 sm:px-6 lg:px-8 lg:pt-28">
          <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
            <div className="hidden xl:block">
              <MarketingDesignPanel />
            </div>

            <div className="space-y-6">
              <section id="product" className="foldera-panel px-5 py-6 sm:px-6 lg:px-8 lg:py-8">
                <div className="grid gap-10 xl:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] xl:items-start">
                  <div className="max-w-[360px]">
                    <p className="foldera-eyebrow text-accent">Finished work, every morning</p>
                    <h1 className="mt-6 text-[54px] font-semibold leading-[0.95] tracking-[-0.06em] text-text-primary sm:text-[72px]">
                      One finished
                      <br />
                      move. Every
                      <br />
                      morning.
                    </h1>
                    <p className="mt-6 text-[18px] leading-8 text-text-secondary">
                      Foldera reads the signals around your real work and delivers the one directive worth acting on —
                      with the reasoning, draft, and source trail already assembled.
                    </p>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                      <a href="/start" className="foldera-button-primary">
                        Start free <ArrowRight className="h-4 w-4" />
                      </a>
                      <a href="#example-brief" className="foldera-button-secondary">
                        See example brief
                      </a>
                    </div>
                    <div className="mt-10 grid gap-3 text-sm text-text-muted sm:grid-cols-2">
                      <div className="foldera-subpanel px-4 py-4">
                        Connected sources, not manual copy-paste
                      </div>
                      <div className="foldera-subpanel px-4 py-4">
                        Reasoning + draft + source trail in one brief
                      </div>
                    </div>
                  </div>

                  <div id="example-brief">
                    <DailyBriefCard
                      className="min-h-full"
                      directive="Send the follow-up to Alex Morgan before noon."
                      whyNow="You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar makes this the cleanest unblocker today."
                      draftBody={
                        <div className="whitespace-pre-line">
                          {`Hi Alex —\n\nFollowing up on the update from yesterday.\nI pulled the latest status and can send the finalized version by noon unless you want one adjustment first.\n\nBest,\nBrandon`}
                        </div>
                      }
                      sourcePills={['Email thread', 'Calendar hold', 'Last draft', 'Connected inbox']}
                      nextStep="Next: Await response"
                      actions={[
                        { label: 'Copy draft', kind: 'secondary' },
                        { label: 'Snooze 24h', kind: 'amber' },
                        { label: 'Approve & send', kind: 'primary' },
                      ]}
                    />
                  </div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="foldera-panel p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-[34px] font-semibold tracking-[-0.05em] text-text-primary">How Foldera works</h2>
                    <a href="/#security" className="text-sm text-accent">
                      Learn more →
                    </a>
                  </div>
                  <div className="mt-6 divide-y divide-border">
                    {howItWorks.map((item) => {
                      const Icon = item.icon;
                      return (
                        <article key={item.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 py-5">
                          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-border bg-panel-raised text-accent">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-lg font-medium tracking-[-0.03em] text-text-primary">{item.title}</h3>
                            <p className="mt-2 text-sm leading-7 text-text-muted">{item.body}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                <div className="foldera-panel p-6" id="security">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-[34px] font-semibold tracking-[-0.05em] text-text-primary">What shows up in the brief</h2>
                    <a href="#example-brief" className="text-sm text-accent">
                      Learn more →
                    </a>
                  </div>
                  <div className="mt-6 divide-y divide-border">
                    {briefRows.map((row) => {
                      const Icon = row.icon;
                      return (
                        <article key={row.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 py-5">
                          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-border bg-panel-raised text-text-secondary">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-lg font-medium tracking-[-0.03em] text-text-primary">{row.title}</h3>
                            <p className="mt-2 text-sm leading-7 text-text-muted">{row.body}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="foldera-panel overflow-hidden p-6">
                <div className="grid gap-8 xl:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)] xl:items-center">
                  <div>
                    <p className="foldera-eyebrow text-accent">Finished work, every morning</p>
                    <h2 className="mt-4 text-[42px] font-semibold leading-[1.02] tracking-[-0.05em] text-text-primary">
                      Stop starting at the work.
                      <br />
                      Get the next finished move.
                    </h2>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                      <a href="/start" className="foldera-button-primary">
                        Start free <ArrowRight className="h-4 w-4" />
                      </a>
                      <a href="/pricing" className="foldera-button-secondary">
                        View pricing
                      </a>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-end">
                    <ul className="space-y-3 text-sm text-text-secondary">
                      <li className="flex items-center gap-3">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px]">✓</span>
                        14-day free trial
                      </li>
                      <li className="flex items-center gap-3">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px]">✓</span>
                        No credit card required
                      </li>
                      <li className="flex items-center gap-3">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px]">✓</span>
                        Cancel anytime
                      </li>
                    </ul>

                    <div className="relative ml-auto h-32 w-full max-w-[170px] rounded-[26px] border border-fuchsia-500/60 bg-[linear-gradient(180deg,rgba(124,58,237,0.12),rgba(14,165,233,0.04))]">
                      <div className="absolute bottom-0 right-0 h-24 w-[120px] rounded-[24px] border border-cyan-300/70 bg-transparent" />
                      <div className="absolute bottom-2 left-4 right-4 h-3 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.45),transparent_72%)] blur-md" />
                    </div>
                  </div>
                </div>
              </section>

              <LandingFooter />
            </div>

            <div className="space-y-6">
              <ProductPreviewPanel />
              <div className="xl:hidden">
                <MarketingDesignPanel />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
