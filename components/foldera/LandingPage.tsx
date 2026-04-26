'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, PlayCircle } from 'lucide-react';
import { NavPublic } from '@/components/nav/NavPublic';
import { DailyBriefCard } from '@/components/foldera/DailyBriefCard';
import { DashboardPreview } from '@/components/foldera/DashboardPreview';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';
import { MobilePreview } from '@/components/foldera/MobilePreview';
import { SignalToBriefFlow } from '@/components/foldera/SignalToBriefFlow';

const heroDraft = `Hi Alex —

Following up on the update from yesterday.
I pulled the latest status and can send the finalized version by noon unless you want one adjustment first.

Best,
Brandon`;

const heroBullets = [
  'One directive, not another task list',
  'Grounded in your connected sources',
  'Approval before anything moves',
];

const sourcePills = ['Email thread', 'Calendar hold', 'Last draft', 'Connected inbox'];
const integrationPills = ['Gmail', 'Outlook', 'Calendar', 'Docs', 'Drive', 'OneDrive'];

export function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg text-text-primary">
      <NavPublic scrolled={scrolled} platformHref="#product" />
      <main id="main" className="foldera-page relative">
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="cinematic-stage" aria-hidden />
          <div className="mx-auto max-w-[1500px] px-4 pb-14 pt-24 sm:px-6 lg:px-8 lg:pb-20 lg:pt-28">
            <div className="grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-panel-raised/70 px-3 py-1.5 text-[11px] font-medium text-text-primary/85 backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
                  Finished work, every morning
                </div>

                <h1 className="mt-6 text-balance text-[48px] font-semibold leading-[0.98] tracking-[-0.05em] text-text-primary sm:text-[66px] lg:text-[84px]">
                  One finished move.
                  <br />
                  <span className="text-text-primary/55">Every morning.</span>
                </h1>

                <p className="mt-5 max-w-xl text-[17px] leading-8 text-text-secondary sm:text-[18px]">
                  Foldera turns scattered inboxes, calendar holds, stale drafts, and unresolved threads into one directive, draft, and source trail.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-2.5">
                  <a
                    href="/start"
                    className="inline-flex items-center gap-2 rounded-[14px] bg-accent px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-accent-hover"
                  >
                    Get started free
                    <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  </a>
                  <a
                    href="#dashboard"
                    className="inline-flex items-center gap-2 rounded-[14px] border border-border bg-panel-raised px-4 py-3 text-sm font-medium text-text-primary/90 transition-colors hover:bg-panel"
                  >
                    <PlayCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    See example
                  </a>
                </div>

                <div className="mt-7 flex flex-wrap gap-4 text-sm text-text-secondary">
                  {heroBullets.map((item) => (
                    <span key={item} className="inline-flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden />
                      {item}
                    </span>
                  ))}
                </div>

                <div className="mt-10 hidden lg:block">
                  <div className="dashboard-stage">
                    <span className="dashboard-stage__glow" aria-hidden />
                    <span className="dashboard-stage__back-2" aria-hidden />
                    <span className="dashboard-stage__back" aria-hidden />
                    <div className="hero-brief-tilt">
                      <DailyBriefCard
                        className="max-w-[760px]"
                        directive="Send the follow-up to Alex Morgan before noon."
                        whyNow="You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar makes this the cleanest unblocker today."
                        draftLabel="FOLLOW-UP EMAIL"
                        draftBody={<div className="whitespace-pre-line">{heroDraft}</div>}
                        sourcePills={sourcePills}
                        nextStep="Next: Await response"
                        statusText="READY TO SEND"
                        footerText="Grounded in connected sources"
                        actions={[
                          { label: 'Copy draft', kind: 'secondary' },
                          { label: 'Snooze 24h', kind: 'amber' },
                          { label: 'Approve & send', kind: 'primary' },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-w-0 lg:hidden">
                <MobilePreview />
              </div>
            </div>
          </div>
        </section>

        <SignalToBriefFlow />

        <section id="dashboard" className="relative overflow-hidden py-12 sm:py-16 lg:py-24">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(70%_70%_at_50%_0%,rgba(34,211,238,0.10),transparent_70%),radial-gradient(50%_60%_at_80%_30%,rgba(124,58,237,0.08),transparent_70%)]" />
          <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="foldera-eyebrow text-accent">The product</p>
              <h2 className="mt-2 text-balance text-[30px] font-semibold tracking-[-0.04em] text-text-primary sm:text-[44px]">
                Open Foldera. See your move.
              </h2>
            </div>

            <div className="mt-10 hidden lg:block">
              <div className="dashboard-stage">
                <span className="dashboard-stage__glow" aria-hidden />
                <span className="dashboard-stage__back-2" aria-hidden />
                <span className="dashboard-stage__back" aria-hidden />
                <DashboardPreview />
              </div>
            </div>

            <div className="mt-10 lg:hidden">
              <MobilePreview />
            </div>
          </div>
        </section>

        <section id="integrations" className="pb-12 sm:pb-16">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
            <div className="surface-card px-6 py-7 sm:px-8">
              <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                Connected context
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {integrationPills.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-border bg-panel-raised px-4 py-2 text-sm text-text-primary/90"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pb-16 lg:pb-24">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
            <div className="surface-card relative overflow-hidden p-8 sm:p-10">
              <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_80%_50%,rgba(34,211,238,0.10),transparent_70%)]" />
              <div className="grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
                <div className="min-w-0">
                  <h3 className="text-balance text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-text-primary sm:text-[40px]">
                    Stop staring at the work.
                    <br />
                    <span className="text-text-primary/55">Get the next finished move.</span>
                  </h3>
                </div>
                <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap md:justify-end">
                  <a
                    href="/start"
                    className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-accent-hover"
                  >
                    Start free
                    <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  </a>
                  <a
                    href="/pricing"
                    className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-border bg-panel-raised px-4 py-3 text-sm font-medium text-text-primary/90 hover:bg-panel"
                  >
                    View pricing
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
            <div>
              <FolderaLogo href="/" />
              <p className="mt-2 text-[12px] text-text-muted">Finished work, every morning.</p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-text-muted">
              <a href="/pricing" className="hover:text-text-primary">Pricing</a>
              <a href="/blog" className="hover:text-text-primary">Blog</a>
              <a href="/security" className="hover:text-text-primary">Security</a>
              <a href="/status" className="hover:text-text-primary">Status</a>
            </nav>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-text-muted">
              <span>© 2026 Foldera, Inc.</span>
              <a href="/privacy" className="hover:text-text-primary">Privacy</a>
              <a href="/terms" className="hover:text-text-primary">Terms</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
