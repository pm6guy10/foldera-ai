'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Mail,
  SkipForward,
  Zap,
} from 'lucide-react';
import { NavPublic } from '@/components/nav/NavPublic';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';

const proofBullets = ['One finished move', 'Source trail included', 'Approval stays yours'];

const valueSteps = [
  {
    title: 'Checks the real sources',
    body: 'Foldera reads connected mail and calendar context so the day starts from evidence, not memory.',
    icon: Mail,
  },
  {
    title: 'Ships the useful artifact',
    body: 'When the signal is strong, you get the ready text, document, or decision frame.',
    icon: CheckCircle2,
  },
  {
    title: 'Stops when it should',
    body: 'When evidence is weak, Foldera tells you the smallest missing input instead of inventing work.',
    icon: CalendarClock,
  },
];

const trustItems = ['Gmail and Microsoft first', 'No outbound by default', 'Disconnect anytime', 'Approve, skip, or save'];

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
      <NavPublic scrolled={scrolled} platformHref="#platform" />
      <main id="main" className="foldera-page foldera-board-page relative">
        <section className="board-hero">
          <div className="board-shell">
            <div className="board-hero__grid">
              <div className="board-hero__copy">
                <h1>
                  The work that matters today.
                  <br />
                  Already <span>written.</span>
                </h1>
                <p className="board-hero__lede">
                  Foldera checks your inbox and calendar, then gives you the finished artifact, the source trail, and the choice to approve or hold.
                </p>
                <div className="board-hero__actions">
                  <a href="/start" className="board-btn board-btn--primary">
                    Get started free
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                  <a href="#platform" className="board-btn board-btn--secondary">
                    See how it works
                  </a>
                </div>
                <div className="board-proof-list board-proof-list--desktop">
                  {proofBullets.map((item) => (
                    <span key={item}>
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <TodayBriefCard className="board-hero__card" />
            </div>
          </div>
        </section>

        <section id="platform" className="board-section">
          <div className="board-shell">
            <div className="board-value-strip">
              <div className="board-section-heading">
                <h2>Worth paying for because it actually produces work.</h2>
                <p>The product loop is intentionally small: source check, finished artifact, safe holdback.</p>
              </div>
              <div className="board-value-grid">
                {valueSteps.map(({ title, body, icon: Icon }) => (
                  <article key={title}>
                    <Icon className="h-5 w-5" aria-hidden />
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="board-section board-section--tight">
          <div className="board-shell">
            <div className="board-trust-band">
              <p>Built around the trust line</p>
              <div>
                {trustItems.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="board-section board-section--tight">
          <div className="board-shell">
            <div className="board-cta">
              <div>
                <h2>Start with one source. See what Foldera can finish.</h2>
                <p>No credit card required. No outbound messages without approval.</p>
                <a href="/start" className="board-btn board-btn--light">
                  Get started free
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer className="board-footer">
          <div className="board-shell">
            <div>
              <FolderaLogo href="/" />
              <p>Finished work when it is safe.</p>
            </div>
            <div className="board-footer__links">
              <a href="/pricing">Pricing</a>
              <a href="/blog">Blog</a>
              <a href="/security">Security</a>
              <a href="/status">Status</a>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function TodayBriefCard({
  className = '',
  compact = false,
  wide = false,
}: {
  className?: string;
  compact?: boolean;
  wide?: boolean;
}) {
  return (
    <article className={`today-brief-card ${compact ? 'today-brief-card--compact' : ''} ${wide ? 'today-brief-card--wide' : ''} ${className}`}>
      <header>
        <span>Daily brief</span>
        <strong>
          Ready
          <i />
        </strong>
      </header>
      <section>
        <div className="today-brief-row">
          <PaperPlaneIcon />
          <div>
            <p>Directive</p>
            <h2>Send the follow-up to Alex Morgan before noon.</h2>
          </div>
        </div>
        <div className="today-brief-row today-brief-row--why">
          <Clock3 className="h-5 w-5" aria-hidden />
          <div>
            <p>Why this now</p>
            <span>You have an open thread with no reply, the ask is time-bound, and the current hold on your calendar makes this the cleanest unblocker today.</span>
          </div>
        </div>
      </section>
      <footer>
        <button type="button" className="brief-action brief-action--approve">
          <Zap className="h-4 w-4" aria-hidden />
          Approve
        </button>
        <button type="button" className="brief-action brief-action--quiet">
          <Clock3 className="h-4 w-4" aria-hidden />
          Snooze 24h
        </button>
        <button type="button" className="brief-action brief-action--quiet">
          <SkipForward className="h-4 w-4" aria-hidden />
          Skip
        </button>
      </footer>
    </article>
  );
}

function PaperPlaneIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 11.4 20 4l-6.2 16-2.6-6.7L4 11.4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m11.2 13.3 3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
