'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Mail,
  MessageSquare,
  Play,
  SkipForward,
  Zap,
} from 'lucide-react';
import { NavPublic } from '@/components/nav/NavPublic';
import { FolderaLogo } from '@/components/foldera/FolderaLogo';
import { FolderaMark } from '@/components/nav/FolderaMark';

const proofBullets = [
  'One directive, not another task list',
  'Grounded in your connected sources',
  'Approval before anything moves',
];

const signalItems = [
  { label: 'Unanswered threads', icon: Mail },
  { label: 'Calendar holds', icon: CalendarClock },
  { label: 'Stale drafts', icon: FileText },
  { label: 'Decision context', icon: MessageSquare },
];

const outputItems = ['Finished artifact when safe', 'Reason when Foldera holds back', 'Approval before anything moves'];

const integrationCards = [
  { label: 'Gmail', brand: 'gmail' },
  { label: 'Outlook', brand: 'outlook' },
  { label: 'Google Calendar', brand: 'calendar' },
  { label: 'Microsoft Calendar', brand: 'outlook' },
];

const reasonTiles = [
  'Shows one useful read',
  'Explains why it stopped',
  'Keeps source trail visible',
  'Avoids weak drafts',
  'Learns from skips',
  'Keeps approval in your hands',
];

const contextRows = [
  { label: 'Cuts busywork', icon: Zap },
  { label: 'Reduces context switching', icon: MessageSquare },
  { label: 'Never miss what matters', icon: CheckCircle2 },
  { label: 'Saves hours each week', icon: Clock3 },
  { label: 'Ships work faster', icon: ArrowRight },
  { label: 'Keeps teams aligned', icon: Check },
];

const trustItems = ['OAuth source access', 'Disconnect anytime', 'No outbound by default', 'Approval before send'];

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
                <p className="board-pill">
                  <span />
                  Finished work when it is safe
                </p>
                <h1>
                  Your day.
                  <br />
                  Already <span>done.</span>
                </h1>
                <p className="board-hero__lede">
                  Foldera checks your connected inbox and calendar, then shows the finished work or the one thing blocking it.
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

              <div className="board-hero__visual" aria-hidden>
                <HeroFolderGraphic className="board-hero__visual-mark" />
              </div>

              <TodayBriefCard className="board-hero__card" />

              <div className="board-proof-list board-proof-list--mobile">
                {proofBullets.map((item) => (
                  <span key={item}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    {item}
                  </span>
                ))}
              </div>

              <div className="board-mobile-actions">
                <a href="/start" className="board-btn board-btn--primary">
                  Get started free
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
                <a href="#platform" className="board-btn board-btn--secondary">
                  See how it works
                </a>
              </div>

              <div className="board-mobile-loved">
                <div aria-hidden>
                  {['B', 'J', 'T', 'R'].map((initial) => (
                    <span key={initial}>{initial}</span>
                  ))}
                </div>
                <p>Loved by early users</p>
                <strong>★★★★★ 4.9/5</strong>
              </div>
            </div>

            <TodayBriefCard className="board-hero__wide-card" wide />

            <div className="trusted-row" aria-label="Foldera operating principles">
              <p>Built for source-backed work</p>
              <div>
                {['Gmail and Microsoft first', 'No outbound by default', 'Approve or skip every artifact', 'No safe artifact is an answer'].map((item) => (
                  <span key={item}>
                    <ShieldMiniIcon />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="board-mobile-action-section">
          <div className="board-shell">
            <MobileActionPreview />
          </div>
        </section>

        <section id="platform" className="board-section">
          <div className="board-shell">
            <div className="board-panel board-how">
              <div className="board-section-heading">
                <h2>See how it works</h2>
                <p>Foldera turns scattered context into finished work when the evidence is strong enough.</p>
              </div>

              <div className="board-mobile-flow" aria-label="Foldera turns noise into one finished move">
                <div>
                  <FlowNoiseIcon />
                  <span>Noise in</span>
                </div>
                <ArrowRight className="board-mobile-flow__arrow" aria-hidden />
                <div>
                  <FlowWaveIcon />
                  <span>Finds what matters</span>
                </div>
                <ArrowRight className="board-mobile-flow__arrow" aria-hidden />
                <div>
                  <FlowDoneIcon />
                  <span>Move out</span>
                </div>
              </div>

              <div className="board-how__grid">
                <div className="board-mini-card">
                  <h3>Signals in</h3>
                  <div className="board-signal-list">
                    {signalItems.map(({ label, icon: Icon }) => (
                      <span key={label}>
                        <Icon className="h-4 w-4" aria-hidden />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="board-core">
                  <span className="board-core__ring board-core__ring--outer" />
                  <span className="board-core__ring board-core__ring--middle" />
                  <HeroFolderGraphic className="board-core-mark" />
                </div>

                <div className="board-mini-card">
                  <h3>Finished move out</h3>
                  <div className="board-output-list">
                    {outputItems.map((item) => (
                      <span key={item}>
                        <Check className="h-4 w-4" aria-hidden />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="board-mobile-chaos">
              <h2>Signals in. Chaos out.</h2>
              <div className="board-mobile-signal-stack">
                {[
                  { label: 'Unanswered threads', icon: Mail, tone: 'cyan' },
                  { label: 'Calendar conflicts', icon: CalendarClock, tone: 'blue' },
                  { label: 'Stale drafts', icon: FileText, tone: 'amber' },
                  { label: 'Decisions waiting', icon: Check, tone: 'green' },
                ].map(({ label, icon: Icon, tone }) => (
                  <span key={label} className={`is-${tone}`}>
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </span>
                ))}
              </div>
              <div className="board-mobile-folder-output" aria-hidden>
                <span />
                <FolderaMark size="lg" className="board-mobile-folder-mark" decorative />
              </div>
              <div className="board-mobile-finished">
                <p>Finished move out</p>
                <h3>Send the follow-up before noon.</h3>
                <span>Open thread, time-bound ask, and a clean window make this the next move.</span>
              </div>
            </div>

            <div className="board-mobile-context">
              <h2>Bring your context together</h2>
              <p>Connect the tools you already use.</p>
              <div>
                {contextRows.map(({ label, icon: Icon }) => (
                  <span key={label} className={label === 'Ships work faster' ? 'is-featured' : ''}>
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="board-panel board-integrations">
              <div className="board-section-heading">
                <h2>Connect the sources that matter now</h2>
                <p>Start with Gmail, Outlook, and calendar context.</p>
              </div>
              <div className="board-tabs" aria-label="Integration categories">
                {['Mail', 'Calendar'].map((item) => (
                  <span key={item} className={item === 'Mail' ? 'is-active' : ''}>{item}</span>
                ))}
              </div>
              <div className="board-integration-grid">
                {integrationCards.map(({ label, brand }) => (
                  <div key={label} className="board-integration-card">
                    <BrandIcon name={brand} />
                    <div>
                      <h3>{label}</h3>
                      <button type="button">Connect</button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="board-more">More integrations coming soon.</p>
            </div>
          </div>
        </section>

        <section className="board-section board-section--tight">
          <div className="board-shell board-two-col">
            <div className="board-panel board-reasons">
              <div className="board-section-heading">
                <h2><span className="desktop-copy">Why teams choose Foldera</span><span className="mobile-copy">Why teams love it</span></h2>
                <p>Real impact, every day.</p>
              </div>
              <div className="reason-grid">
                {reasonTiles.map((item) => (
                  <span key={item} className={item === 'Ships work faster' ? 'is-featured' : ''}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="board-panel board-results">
              <h2>Value that shows up daily</h2>
              {[
                ['Daily', 'Source check against your current context'],
                ['Grounded', 'Artifact or blocker with a visible source trail'],
                ['Controlled', 'Approve, skip, or save before anything moves'],
                ['Honest', 'No weak artifact when the evidence is not enough'],
              ].map(([value, label]) => (
                <div key={value}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="board-section board-section--tight board-mobile-trust-section">
          <div className="board-shell">
            <div className="board-mobile-trust">
              <h2>Built with trust</h2>
              <div>
                {trustItems.map((item) => (
                  <span key={item}>
                    <ShieldMiniIcon />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="board-section board-section--tight">
          <div className="board-shell">
            <div className="board-cta">
              <div>
                <h2>Get a useful read every day.</h2>
                <p>Start free. No credit card required.</p>
                <a href="/start" className="board-btn board-btn--light">
                  Get started free
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </div>
              <TodayBriefCard compact />
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

function MobileActionPreview() {
  return (
    <div className="board-mobile-action-preview">
      <h2>See it in action</h2>
      <div>
        <div className="action-preview-network" aria-hidden>
          {integrationCards.slice(0, 8).map(({ brand }, index) => (
            <span key={brand} style={{ '--i': index } as CSSProperties}>
              <BrandIcon name={brand} />
            </span>
          ))}
          <button type="button" aria-label="Play Foldera overview">
            <Play className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p>Foldera turns scattered context into one finished move.</p>
        <a href="#platform">Watch 45s overview</a>
      </div>
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

function FlowNoiseIcon() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r="27" fill="rgba(8, 17, 28, 0.86)" stroke="rgba(148, 163, 184, 0.18)" />
      {[
        [18, 19, 1.8],
        [28, 14, 1.4],
        [38, 20, 2],
        [16, 31, 1.5],
        [27, 28, 2.2],
        [40, 34, 1.6],
        [23, 41, 1.4],
        [35, 43, 1.8],
      ].map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#d7e5f0" />
      ))}
    </svg>
  );
}

function FlowWaveIcon() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r="27" fill="rgba(8, 17, 28, 0.86)" stroke="rgba(245, 158, 11, 0.38)" />
      <path
        d="M12 29h5l3-10 5 20 5-25 5 25 4-15 3 5h4"
        fill="none"
        stroke="#f59e0b"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function FlowDoneIcon() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r="27" fill="rgba(8, 17, 28, 0.86)" stroke="rgba(34, 197, 94, 0.42)" />
      <path
        d="m17.5 29 7.2 7.1L39 20.2"
        fill="none"
        stroke="#22c55e"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.4"
      />
    </svg>
  );
}

function HeroFolderGraphic({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 320 220" fill="none" aria-hidden>
      <defs>
        <linearGradient id="hero-folder-stroke" x1="34" y1="40" x2="292" y2="202" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f02bff" />
          <stop offset="0.42" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#22f7f7" />
        </linearGradient>
        <linearGradient id="hero-folder-fill" x1="54" y1="48" x2="260" y2="204" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3f0b5f" stopOpacity="0.56" />
          <stop offset="0.48" stopColor="#07132b" stopOpacity="0.72" />
          <stop offset="1" stopColor="#063841" stopOpacity="0.72" />
        </linearGradient>
        <filter id="hero-folder-glow" x="-30%" y="-40%" width="160%" height="190%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.45 0 0 0 0 0.03 0 0 0 0 0.92 0 0 0 0.78 0" result="magenta" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="edge" />
          <feMerge>
            <feMergeNode in="magenta" />
            <feMergeNode in="edge" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#hero-folder-glow)">
        <path
          d="M56 187V63c0-15.5 12.5-28 28-28h70c8.3 0 16.2 3.7 21.5 10.1L205 80h55c15.5 0 28 12.5 28 28v28"
          stroke="url(#hero-folder-stroke)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M56 187 158.5 88.8c6.8-6.5 15.9-10.2 25.3-10.2h82.9c16.7 0 29.7 14.7 27.5 31.2l-10.9 79.4c-2.3 16.6-16.5 28.9-33.3 28.9H86.3C68.5 218.1 55.5 204.4 56 187Z"
          fill="url(#hero-folder-fill)"
          stroke="url(#hero-folder-stroke)"
          strokeWidth="8"
          strokeLinejoin="round"
        />
        <path
          d="M158.5 88.8 56 187"
          stroke="url(#hero-folder-stroke)"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

function ShieldMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3.5 18 6v5.2c0 3.8-2.4 7.1-6 9.1-3.6-2-6-5.3-6-9.1V6l6-2.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m8.8 12.2 2.1 2.1 4.4-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrandIcon({ name }: { name: string }) {
  if (name === 'gmail') {
    return (
      <svg className="brand-icon brand-icon--gmail" viewBox="0 0 32 32" aria-hidden>
        <path d="M5 9.5 16 18 27 9.5v14A2.5 2.5 0 0 1 24.5 26h-17A2.5 2.5 0 0 1 5 23.5v-14Z" fill="#fff" />
        <path d="M5 9.5 16 18 27 9.5" fill="none" stroke="#EA4335" strokeWidth="4" strokeLinejoin="round" />
        <path d="M5 9.5v14A2.5 2.5 0 0 0 7.5 26H10V13.4L5 9.5Z" fill="#34A853" />
        <path d="M27 9.5v14a2.5 2.5 0 0 1-2.5 2.5H22V13.4l5-3.9Z" fill="#4285F4" />
        <path d="M5 9.5 16 18 27 9.5 24.8 6.7 16 13.5 7.2 6.7 5 9.5Z" fill="#FBBC04" />
        <path d="m5 9.5 5 3.9v-3L7.2 6.7 5 9.5Z" fill="#EA4335" />
        <path d="m27 9.5-5 3.9v-3l2.8-3.7L27 9.5Z" fill="#EA4335" />
      </svg>
    );
  }

  if (name === 'outlook') {
    return (
      <svg className="brand-icon" viewBox="0 0 32 32" aria-hidden>
        <rect x="10" y="6" width="16" height="20" rx="2.5" fill="#28A8EA" />
        <rect x="14" y="9" width="12" height="7" rx="1.4" fill="#50D9FF" />
        <rect x="14" y="17" width="12" height="6" rx="1.4" fill="#0364B8" />
        <rect x="4" y="10" width="14" height="14" rx="2.2" fill="#0078D4" />
        <circle cx="11" cy="17" r="4" fill="#fff" opacity=".92" />
        <circle cx="11" cy="17" r="2.35" fill="#0078D4" />
      </svg>
    );
  }

  if (name === 'calendar') {
    return (
      <svg className="brand-icon" viewBox="0 0 32 32" aria-hidden>
        <rect x="5" y="5" width="22" height="22" rx="3" fill="#fff" />
        <path d="M5 10a5 5 0 0 1 5-5h4v8H5v-3Z" fill="#4285F4" />
        <path d="M18 5h4a5 5 0 0 1 5 5v3h-9V5Z" fill="#34A853" />
        <path d="M5 13h9v14h-4a5 5 0 0 1-5-5v-9Z" fill="#FBBC04" />
        <path d="M18 13h9v9a5 5 0 0 1-5 5h-4V13Z" fill="#EA4335" />
        <text x="16" y="22" textAnchor="middle" fontSize="10" fontWeight="800" fill="#1f2937">31</text>
      </svg>
    );
  }

  return (
    <svg className="brand-icon" viewBox="0 0 32 32" aria-hidden>
      <path d="m10 4 6 4-6 4-6-4 6-4Z" fill="#0061FF" />
      <path d="m22 4 6 4-6 4-6-4 6-4Z" fill="#0061FF" />
      <path d="m10 14 6 4-6 4-6-4 6-4Z" fill="#0061FF" />
      <path d="m22 14 6 4-6 4-6-4 6-4Z" fill="#0061FF" />
      <path d="m16 22 6 4-6 4-6-4 6-4Z" fill="#0061FF" />
    </svg>
  );
}
