'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Image from 'next/image';
import {
  Activity,
  ArrowRight,
  Check,
  Circle,
  Eye,
  Globe,
  Layers,
  Menu,
  Scale,
  Search,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';

type LandingPageProps = {
  isAuthenticated?: boolean;
};

/* ----------------------------------------------------- connector logos */

const logoSrc = (name: string) => `/logos/${name}.svg`;

function Logo({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  return (
    <Image
      src={logoSrc(name)}
      alt=""
      width={size}
      height={size}
      unoptimized
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

/* ----------------------------------------------------- count-up (crisp, on-view) */

function CountUp({
  end,
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = 1500,
}: {
  end: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(end);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started.current) {
            started.current = true;
            const start = performance.now();
            const step = (now: number) => {
              const p = Math.min(1, (now - start) / duration);
              const eased = 1 - Math.pow(1 - p, 3);
              setValue(end * eased);
              if (p < 1) requestAnimationFrame(step);
              else setValue(end);
            };
            requestAnimationFrame(step);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [end, duration]);

  const shown = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString('en-US');
  return (
    <span ref={ref}>
      {prefix}
      {shown}
      {suffix}
    </span>
  );
}

/* ----------------------------------------------------- content */

const navLinks = [
  { href: '#how', label: 'Presence Layer' },
  { href: '#tax', label: 'The tax' },
  { href: '#trust', label: 'Trust' },
  { href: '#cta', label: 'Pilot' },
];

const taxCells: Array<{ value: number; decimals: number; prefix: string; u: string; lab: string; src: string }> = [
  { value: 9.4, decimals: 1, prefix: '', u: 'hrs', lab: 'Lost every week to context switching.', src: 'Workplace research' },
  { value: 2.7, decimals: 1, prefix: '', u: '×', lab: 'Slower to refocus after each interruption.', src: 'Attention studies' },
  { value: 31, decimals: 0, prefix: '', u: '%', lab: 'Of knowledge work is rework.', src: 'Industry survey' },
  { value: 37, decimals: 0, prefix: '$', u: 'B+', lab: 'The annual tax across the Fortune 500.', src: 'Aggregate estimate' },
];

const integrationApps = ['gmail', 'slack', 'notion', 'linear', 'google-calendar', 'github', 'google-drive', 'outlook'];

const memoryRows: Array<[string, string]> = [
  ['working_on', '"Q2 headcount plan"'],
  ['waiting_on', '"Finance sign-off"'],
  ['last_touched', '"renewal brief · 2d ago"'],
  ['blocked_by', '"budget review @ 4:00"'],
  ['next_move', '"reply to Sarah"'],
];

const rankedRows: Array<{ title: string; priority: string; lead: boolean; detail: string }> = [
  { title: 'Follow up with Sarah', priority: 'Do first', lead: true, detail: 'Mentioned you · deadline today' },
  { title: 'Review the renewal brief', priority: 'Later', lead: false, detail: 'No pressure until Thursday' },
  { title: 'Reply in #deals', priority: 'Later', lead: false, detail: 'FYI — no decision needed' },
];

const searchRows: Array<{ logo: string; text: string; meta: string }> = [
  { logo: 'notion', text: 'Renewal brief · final terms', meta: 'Notion' },
  { logo: 'slack', text: '#deals — "agreed on $48k" (Sarah)', meta: 'Slack' },
  { logo: 'google-drive', text: 'Q2_Headcount_v7.xlsx', meta: 'Drive' },
];

// Hero constellation — scattered real work, collapsing toward one move.
const constellationChips: Array<{ logo: string; title: string; meta: string; top: string; left: string; delay: string }> = [
  { logo: 'gmail', title: 'Re: Contract v4', meta: '2:14', top: '3%', left: '-2%', delay: '0s' },
  { logo: 'slack', title: 'DM · Sarah', meta: 'now', top: '-1%', left: '56%', delay: '0.8s' },
  { logo: 'linear', title: 'PROJ-4821', meta: 'blocked', top: '31%', left: '70%', delay: '1.6s' },
  { logo: 'google-calendar', title: 'Budget · 4:00', meta: 'hold', top: '63%', left: '-3%', delay: '0.4s' },
  { logo: 'notion', title: 'Launch plan v7', meta: '', top: '80%', left: '26%', delay: '1.2s' },
  { logo: 'google-drive', title: 'Q2_Headcount', meta: '', top: '72%', left: '62%', delay: '2s' },
];

type FeatureColor = 'cyan' | 'violet' | 'emerald' | 'magenta' | 'amber';

const features: Array<{
  flip: boolean;
  color: FeatureColor;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  mockTitle: string;
  mock: ReactNode;
}> = [
  {
    flip: false,
    color: 'violet',
    icon: <Layers aria-hidden="true" />,
    eyebrow: '[ 01 · Attached state ]',
    title: 'Your context follows you everywhere.',
    body: 'The thread of what you’re working on stays attached across every consented system — so nothing has to be rebuilt when you switch tools.',
    bullets: [
      'One continuous state across mail, docs, tickets and chat',
      'No re-reading, no reconstructing where you left off',
      'Private to you — context never leaves your control',
    ],
    mockTitle: 'foldera · attached state',
    mock: (
      <div className="mock-body">
        <div className="mem">
          {memoryRows.map(([k, v]) => (
            <div className="kv" key={k}>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    flip: true,
    color: 'cyan',
    icon: <Activity aria-hidden="true" />,
    eyebrow: '[ 02 · Meaningful change ]',
    title: 'It notices what actually moved.',
    body: 'Foldera watches every connected source for the changes that matter, weighs them against your day, and ranks the one thing worth your attention now.',
    bullets: [
      'Signal separated from noise, automatically',
      'Priority based on deadlines, mentions and blockers',
      'Grounded in the exact sources behind it',
    ],
    mockTitle: 'foldera · ranked today',
    mock: (
      <div className="mock-body">
        {rankedRows.map((row) => (
          <div className={`qrow ${row.lead ? 'lead' : ''}`} key={row.title}>
            <span className="qi">
              {row.lead ? (
                <Zap style={{ width: 13, height: 13, color: 'var(--cyan)' }} aria-hidden="true" />
              ) : (
                <Circle style={{ width: 13, height: 13, color: 'var(--fg5)' }} aria-hidden="true" />
              )}
            </span>
            <span className="qt">
              {row.title}
              <div style={{ fontSize: '11.5px', color: 'var(--fg5)', marginTop: 3 }}>{row.detail}</div>
            </span>
            <span className="qm">{row.priority}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    flip: false,
    color: 'emerald',
    icon: <Search aria-hidden="true" />,
    eyebrow: '[ 03 · Universal recall ]',
    title: 'Find anything, across every app.',
    body: 'Ask in plain language. Foldera searches across all your connected tools at once and answers from the source — buried files, lost threads, half-remembered decisions.',
    bullets: [
      'One query spans every connected system',
      'Answers cite the file, message or doc they came from',
      'Read-only — nothing changes without you',
    ],
    mockTitle: 'foldera · universal search',
    mock: (
      <div className="mock-body">
        <div className="qrow lead">
          <span className="qi">
            <Search style={{ width: 13, height: 13, color: 'var(--cyan)' }} aria-hidden="true" />
          </span>
          <span className="qt" style={{ color: 'var(--fg1)' }}>
            Where did we land on the renewal price?
          </span>
        </div>
        {searchRows.map((row) => (
          <div className="qrow" key={row.text}>
            <span className="qi">
              <Logo name={row.logo} size={14} />
            </span>
            <span className="qt">{row.text}</span>
            <span className="qm">{row.meta}</span>
          </div>
        ))}
      </div>
    ),
  },
];

const flowSteps: Array<{ n: string; color: FeatureColor; icon: ReactNode; title: string; body: string }> = [
  { n: '01', color: 'cyan', icon: <Eye aria-hidden="true" />, title: 'Watch', body: 'Foldera keeps state attached across every consented source — quietly, in the background.' },
  { n: '02', color: 'violet', icon: <Scale aria-hidden="true" />, title: 'Weigh', body: 'It ranks what actually moved against your day — deadlines, mentions, blockers.' },
  { n: '03', color: 'magenta', icon: <Sparkles aria-hidden="true" />, title: 'Surface', body: 'One trusted move arrives, context attached and ready to approve. Then silence.' },
];

const liveBars: Array<{ label: string; width: string; muted: boolean }> = [
  { label: 'Gmail', width: '88%', muted: false },
  { label: 'Slack', width: '64%', muted: false },
  { label: 'Drive', width: '41%', muted: true },
];

const principles: Array<[string, string, string]> = [
  ['01', 'Consent-based access', 'You choose exactly what connects. Nothing is read without an explicit, revocable grant.'],
  ['02', 'Read-only by default', 'Foldera observes and drafts. It never acts on your accounts unless you approve the move.'],
  ['03', 'Never trained on', 'Your content is yours. It is never used to train models, and is encrypted in transit and at rest.'],
  ['04', 'Audit & revoke', 'Every access is logged and visible. Disconnect any source and its state leaves with it.'],
];

const footerCols: Array<{ title: string; links: string[] }> = [
  { title: 'Product', links: ['Presence Layer', 'How it works', 'Security', 'Pricing'] },
  { title: 'Company', links: ['About', 'Pilot', 'Careers', 'Contact'] },
  { title: 'Legal', links: ['Privacy', 'Terms', 'Data processing', 'Trust center'] },
];

/* ----------------------------------------------------- primitives */

function BrandLockup({ extraClass = '' }: { extraClass?: string }) {
  return (
    <a href="#top" className={`brand ${extraClass}`} aria-label="Foldera home">
      <Image className="mark mk" src="/foldera-glyph.svg" alt="" width={26} height={26} unoptimized />
      <span className="wm">Foldera</span>
    </a>
  );
}

/* ----------------------------------------------------- hero decision card (live state machine) */

type DecisionState = 'active' | 'changed' | 'stale' | 'conflict';

type CardSource = { logo: string; title: string; detail: string; meta: string; tone?: 'hot' | 'muted' };

type DecisionView = {
  badge?: { label: string; kind: 'changed' | 'stale' | 'conflict' };
  kicker: string;
  directive?: string;
  options?: Array<{ logo: string; title: string; detail: string; conf: string }>;
  why: ReactNode;
  callout?: { text: string; muted?: boolean };
  sources?: CardSource[];
  note: string;
  primary: string;
  secondary: string;
};

// The whole product expressed as one surface that changes state on incoming work
// signals. The landing page renders that state machine live so visitors feel the
// system deciding, refining, and narrowing — never a static screenshot.
const DECISION_VIEWS: Record<DecisionState, DecisionView> = {
  active: {
    kicker: 'Your next move',
    directive: 'Review the Q2 headcount plan.',
    why: (
      <>
        <b>Sarah</b> updated the doc, Finance commented, and you were mentioned in Slack. Approving now unblocks the
        budget timeline.
      </>
    ),
    callout: { text: 'Draft reply ready — approve to send, or open the doc first.' },
    sources: [
      { logo: 'slack', title: 'Slack', detail: '#q2-planning — mentioned you', meta: '3 new', tone: 'hot' },
      { logo: 'gmail', title: 'Gmail', detail: 'Re: Headcount — Finance', meta: '2:14' },
      { logo: 'google-calendar', title: 'Google Calendar', detail: 'Budget review · Today 4:00', meta: 'hold' },
    ],
    note: 'State attached · context private',
    primary: 'Open the doc',
    secondary: 'Snooze',
  },
  changed: {
    badge: { label: 'Updated', kind: 'changed' },
    kicker: 'Your next move',
    directive: 'Review the Q2 headcount plan.',
    why: (
      <>
        <b>New —</b> Finance just signed off on the budget line. The move is the same; the reasoning just got stronger.
      </>
    ),
    callout: { text: 'Draft reply refreshed with the approved numbers.' },
    sources: [
      { logo: 'slack', title: 'Slack', detail: '#q2-planning — Finance approved', meta: '5 new', tone: 'hot' },
      { logo: 'gmail', title: 'Gmail', detail: 'Re: Headcount — sign-off', meta: 'now', tone: 'hot' },
      { logo: 'google-calendar', title: 'Google Calendar', detail: 'Budget review · Today 4:00', meta: 'hold' },
    ],
    note: 'Refined from 2 new signals · 09:43',
    primary: 'Open the doc',
    secondary: 'Snooze',
  },
  stale: {
    badge: { label: 'Update available', kind: 'stale' },
    kicker: 'Confidence dropped',
    directive: 'Review the Q2 headcount plan.',
    why: 'The doc hasn’t moved in three days and the budget review has passed. This may no longer be your best next move.',
    callout: { text: 'The signals behind this have gone quiet.', muted: true },
    sources: [
      { logo: 'slack', title: 'Slack', detail: '#q2-planning — last reply', meta: '3d ago', tone: 'muted' },
      { logo: 'gmail', title: 'Gmail', detail: 'Re: Headcount — Finance', meta: '2d ago', tone: 'muted' },
      { logo: 'google-calendar', title: 'Google Calendar', detail: 'Budget review · ended', meta: 'past', tone: 'muted' },
    ],
    note: 'Last reinforced 3 days ago',
    primary: 'Re-evaluate',
    secondary: 'Keep anyway',
  },
  conflict: {
    badge: { label: 'Two priorities', kind: 'conflict' },
    kicker: 'Two priorities are competing',
    why: 'Both cleared the bar at the same moment. Foldera won’t quietly collapse them — the call stays yours.',
    options: [
      { logo: 'slack', title: 'Close the ACME renewal', detail: 'Deadline today · Sarah is waiting', conf: 'High' },
      { logo: 'gmail', title: 'Review the Q2 headcount plan', detail: 'Finance is blocked on you', conf: 'High' },
    ],
    note: '2 candidates · equal confidence',
    primary: 'Let Foldera decide',
    secondary: 'I’ll choose',
  },
};

const DECISION_SEQUENCE: DecisionState[] = ['active', 'changed', 'active', 'stale', 'active', 'conflict'];
const DECISION_DWELL: Record<DecisionState, number> = { active: 4600, changed: 2800, stale: 5200, conflict: 6200 };
const DECISION_STATES: DecisionState[] = ['active', 'changed', 'stale', 'conflict'];
const STATE_LABELS: Record<DecisionState, string> = {
  active: 'Active decision',
  changed: 'Refined by a new signal',
  stale: 'Confidence dropped',
  conflict: 'Two priorities competing',
};

function HeroDecisionCard({ accessHref }: { accessHref: string }) {
  const [seqIdx, setSeqIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  const state = DECISION_SEQUENCE[seqIdx];

  useEffect(() => {
    if (reduced || paused) return;
    const t = window.setTimeout(() => setSeqIdx((i) => (i + 1) % DECISION_SEQUENCE.length), DECISION_DWELL[state]);
    return () => window.clearTimeout(t);
  }, [seqIdx, paused, reduced, state]);

  const view = DECISION_VIEWS[state];

  const jumpTo = (target: DecisionState) => {
    const idx = DECISION_SEQUENCE.indexOf(target);
    if (idx !== -1) setSeqIdx(idx);
  };

  return (
    <div className="stage">
      <div className="stage-glow" aria-hidden="true" />
      <div
        className={`rn is-${state}`}
        data-testid="landing-right-now-card"
        data-state={state}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        <div className="rn-scan" aria-hidden="true" />
        <div className="rn-top">
          <span className="rn-live">
            <span className="dot" /> Right Now
          </span>
          <span className="rn-modes" role="tablist" aria-label="Decision state">
            {DECISION_STATES.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === state}
                aria-label={STATE_LABELS[s]}
                className={`md ${s === state ? 'on' : ''}`}
                onClick={() => jumpTo(s)}
              />
            ))}
          </span>
        </div>
        <div className="rn-main">
          <div className="rn-anim" key={state}>
            <div className="rn-kicker">
              {view.kicker}
              {view.badge ? <span className={`rn-badge ${view.badge.kind}`}>{view.badge.label}</span> : null}
            </div>
            {view.directive ? <div className="rn-directive">{view.directive}</div> : null}
            {view.options ? (
              <div className="rn-opts">
                {view.options.map((opt) => (
                  <div className="rn-opt" key={opt.title}>
                    <span className="ic">
                      <Logo name={opt.logo} size={15} />
                    </span>
                    <span className="tx">
                      <b>{opt.title}</b>
                      <span>{opt.detail}</span>
                    </span>
                    <span className="conf">{opt.conf}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="rn-why">{view.why}</p>
            {view.callout ? (
              <div className={`callout ${view.callout.muted ? 'muted' : ''}`}>
                <Sparkles aria-hidden="true" />
                {view.callout.text}
              </div>
            ) : null}
            {view.sources ? (
              <div className="rn-srcs">
                {view.sources.map((s) => (
                  <div className="rn-src" key={s.detail}>
                    <span className="ic">
                      <Logo name={s.logo} size={15} />
                    </span>
                    <span className="tx">
                      <b>{s.title}</b>
                      <s>{s.detail}</s>
                    </span>
                    <span className={`m ${s.tone === 'hot' ? 'hot' : ''} ${s.tone === 'muted' ? 'mut' : ''}`}>
                      {s.meta}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="rn-foot">
              <span className="note">{view.note}</span>
              <span className="rn-acts">
                <button type="button" className="btn btn-ghost btn-sm">
                  {view.secondary}
                </button>
                <a href={accessHref} className="btn btn-primary btn-sm">
                  {view.primary}
                </a>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------- page */

export function LandingPage({ isAuthenticated = false }: LandingPageProps = {}) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Authenticated visitors go straight to the app; everyone else enters the funnel.
  const accessHref = isAuthenticated ? '/dashboard' : '/start';
  const loginHref = isAuthenticated ? '/dashboard' : '/login';

  // Scroll-reveal + section "in" toggles (bars, sparkline, flow line).
  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('.fd .reveal.pre, .fd .live, .fd .flow-wrap'),
    );
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      nodes.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -6% 0px' },
    );
    nodes.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="fd">
      <header className="hdr" data-testid="landing-header">
        <div className="shell">
          <div className="hdr-in">
            <BrandLockup />
            <nav className="nav" aria-label="Primary">
              {navLinks.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
            <div className="hdr-r">
              <a href={loginHref} className="signin" data-testid="landing-login-cta">
                Sign in
              </a>
              <a href={accessHref} className="btn btn-ghost btn-sm req-pill" data-testid="landing-header-cta">
                Request access
              </a>
              <button
                type="button"
                className="menu-btn"
                aria-label="Open menu"
                aria-expanded={menuOpen}
                data-testid="nav-mobile-menu-toggle"
                onClick={() => setMenuOpen(true)}
              >
                <Menu style={{ width: 22, height: 22 }} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className={`mobile ${menuOpen ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Site menu">
        <div className="shell">
          <div className="mobile-top">
            <BrandLockup />
            <button
              type="button"
              className="menu-btn"
              aria-label="Close menu"
              data-testid="nav-mobile-overlay-close"
              style={{ display: 'inline-flex' }}
              onClick={() => setMenuOpen(false)}
            >
              <X style={{ width: 22, height: 22 }} aria-hidden="true" />
            </button>
          </div>
          <nav className="mobile-list" aria-label="Mobile">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ))}
            <div className="mobile-grp">Account</div>
            <a href={loginHref} style={{ fontSize: 18, color: 'var(--fg3)' }} onClick={() => setMenuOpen(false)}>
              Sign in
            </a>
            <a
              href={accessHref}
              className="btn btn-primary"
              style={{ marginTop: 18, alignSelf: 'flex-start' }}
              onClick={() => setMenuOpen(false)}
            >
              Request access
            </a>
          </nav>
        </div>
      </div>

      <main id="main">
        <span id="top" />

        {/* HERO */}
        <section className="hero" data-testid="landing-hero">
          <div className="hero-bloom" aria-hidden="true" />
          <div className="shell">
            <div className="hero-grid">
              <div>
                <span className="gpill reveal pre">
                  <span className="tag">New</span> The Workday Presence Layer
                </span>
                <h1 className="reveal pre">
                  Stop rebuilding the work.
                  <span className="dim">
                    Foldera holds <span className="em">the thread.</span>
                  </span>
                </h1>
                <p className="hero-tag reveal pre">
                  All your context.
                  <br />
                  Every app. One move.
                </p>
                <p className="hero-sub reveal pre">
                  The problem isn’t a lack of AI — it’s broken continuity. Foldera keeps your workday state attached
                  across every consented system, then returns one trusted next move. Quiet otherwise.
                </p>
                <div className="hero-cta reveal pre">
                  <a href={accessHref} className="btn btn-primary" data-testid="landing-primary-access-cta">
                    Request access <ArrowRight style={{ width: 15, height: 15 }} aria-hidden="true" />
                  </a>
                  <a href="#how" className="btn btn-ghost">
                    See how it works
                  </a>
                </div>
              </div>
              <div className="hero-stage reveal pre">
                <HeroDecisionCard accessHref={accessHref} />
              </div>
            </div>
          </div>
        </section>

        {/* INTEGRATION WALL */}
        <section className="iwall" data-testid="landing-connectors">
          <div className="shell">
            <p className="cap reveal pre">Connects to the tools your work already lives in</p>
            <div className="iwall-grid reveal pre">
              {integrationApps.map((app) => (
                <div className="iwall-cell" key={app}>
                  <Logo name={app} size={30} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRODUCT CENTERPIECE */}
        <section className="center" id="product" data-testid="landing-product">
          <div className="shell">
            <div className="center-head reveal pre">
              <div className="eyerule" style={{ justifyContent: 'center' }}>
                <span className="ln" />
                <span className="lbl cyan">[ One move at a time ]</span>
                <span className="ln" />
              </div>
              <h2>
                Nine apps go quiet. <span className="dim">One trusted move appears.</span>
              </h2>
            </div>
            <div className="constellation-stage reveal pre">
              <div className="con" aria-hidden="true">
                <span className="con-ring r2" />
                <span className="con-ring r1" />
                {constellationChips.map((chip) => (
                  <span
                    key={chip.title}
                    className="con-chip"
                    style={{ top: chip.top, left: chip.left, animationDelay: chip.delay }}
                  >
                    <Logo name={chip.logo} size={16} />
                    <span className="ct">{chip.title}</span>
                    {chip.meta ? <span className="cm">{chip.meta}</span> : null}
                  </span>
                ))}
              </div>
              <div className="hero-mark-glow" aria-hidden="true" />
              <Image
                className="mark hero-mark"
                src="/foldera-glyph.svg"
                alt="Foldera mark"
                width={500}
                height={500}
                unoptimized
              />
            </div>
          </div>
        </section>

        {/* RECONSTRUCTION TAX */}
        <section className="sec" id="tax" data-testid="landing-tax">
          <div className="shell">
            <div className="sec-head reveal pre">
              <div className="eyerule">
                <span className="lbl magenta">[ The reconstruction tax ]</span>
                <span className="ln" />
              </div>
              <h2>
                You’re a high-paid <span className="dim">filing clerk.</span>
              </h2>
              <p>
                Every tool switch leaks context. Every app remembers only its own slice. You’re the glue — and it costs
                more than you think.
              </p>
            </div>
            <div className="fstat reveal pre" style={{ marginTop: 48 }}>
              <div className="big">
                1 day<span className="u">a week</span>
              </div>
              <p className="cap">
                That’s how much of your week disappears into <b>rebuilding context</b> — switching tabs, re-reading
                threads, reconstructing where you left off.
              </p>
            </div>
            <div className="tax reveal pre" style={{ marginTop: 16 }}>
              {taxCells.map((cell) => (
                <div className="taxcell" key={cell.lab}>
                  <div className="num">
                    <CountUp end={cell.value} decimals={cell.decimals} prefix={cell.prefix} />
                    <span className="u">{cell.u}</span>
                  </div>
                  <div className="lab">{cell.lab}</div>
                  <div className="src">{cell.src}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* LIVE INTELLIGENCE */}
        <section className="live" data-testid="landing-live">
          <div className="shell">
            <div className="sec-head reveal pre" style={{ marginBottom: 36 }}>
              <div className="eyerule">
                <span className="lbl emerald">[ Live intelligence ]</span>
                <span className="ln" />
              </div>
              <h2>
                It watches so <span className="dim">you don’t have to.</span>
              </h2>
            </div>
            <div className="live-panel reveal pre">
              <div className="live-grid">
                <div>
                  <div className="live-num">
                    <CountUp end={1240} suffix="" /> <span className="u">signals</span>
                  </div>
                  <p className="live-cap">
                    Reconnected across your tools in an example workday — held as one thread, surfaced as a single move.
                  </p>
                  <div className="live-bars">
                    {liveBars.map((bar) => (
                      <div className={`live-bar ${bar.muted ? 'muted' : ''}`} key={bar.label}>
                        <span className="bl">{bar.label}</span>
                        <span className="track">
                          <span className="fill" style={{ '--w': bar.width } as CSSProperties} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="live-chart">
                  <div className="ct">Attention reclaimed · example</div>
                  <svg viewBox="0 0 320 120" preserveAspectRatio="none" role="img" aria-label="Illustrative trend">
                    <defs>
                      <linearGradient id="sparkgrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(52,211,153,0.35)" />
                        <stop offset="100%" stopColor="rgba(52,211,153,0)" />
                      </linearGradient>
                    </defs>
                    <path
                      className="spark-fill"
                      d="M0,96 L26,84 L52,90 L78,66 L104,72 L130,50 L156,58 L182,38 L208,46 L234,26 L260,34 L286,16 L320,22 L320,120 L0,120 Z"
                    />
                    <path
                      className="spark-line"
                      d="M0,96 L26,84 L52,90 L78,66 L104,72 L130,50 L156,58 L182,38 L208,46 L234,26 L260,34 L286,16 L320,22"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PRESENCE LAYER — feature blocks */}
        <section className="sec" id="how" style={{ paddingBottom: 0 }} data-testid="landing-presence">
          <div className="shell">
            <div className="sec-head reveal pre">
              <div className="eyerule">
                <span className="lbl cyan">[ The presence layer ]</span>
                <span className="ln" />
              </div>
              <h2>
                Not another inbox. <span className="dim">A layer of continuity.</span>
              </h2>
            </div>
          </div>

          {features.map((feature) => (
            <div className="shell" key={feature.eyebrow}>
              <div className={`feat ${feature.flip ? 'flip' : ''}`}>
                <div className="feat-copy reveal pre">
                  <span className={`chip feat-ic ${feature.color}`}>{feature.icon}</span>
                  <div className="eyerule">
                    <span className={`lbl ${feature.color}`}>{feature.eyebrow}</span>
                    <span className="ln" />
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                  <ul className="feat-list">
                    {feature.bullets.map((b) => (
                      <li key={b}>
                        <Check aria-hidden="true" /> {b}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="reveal pre">
                  <div className="mock">
                    <div className="mock-in">
                      <div className="mock-bar">
                        <span className="d" />
                        <span className="d" />
                        <span className="d" />
                        <span className="t">{feature.mockTitle}</span>
                      </div>
                      {feature.mock}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* PROCESS FLOW */}
        <section className="sec" data-testid="landing-flow">
          <div className="shell">
            <div className="sec-head reveal pre" style={{ marginInline: 'auto', textAlign: 'center' }}>
              <div className="eyerule" style={{ justifyContent: 'center' }}>
                <span className="ln" />
                <span className="lbl cyan">[ How the presence layer works ]</span>
                <span className="ln" />
              </div>
              <h2>
                Three steps. <span className="dim">Then it’s quiet.</span>
              </h2>
            </div>
            <div className="flow-wrap reveal pre">
              <span className="flow-line" aria-hidden="true" />
              <div className="flow">
                {flowSteps.map((step) => (
                  <div className="flow-step" key={step.n}>
                    <span className={`chip ${step.color}`}>{step.icon}</span>
                    <span className="sn">{step.n}</span>
                    <h4>{step.title}</h4>
                    <p>{step.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* TRUST */}
        <section className="sec" id="trust" data-testid="landing-trust">
          <div className="shell">
            <div className="sec-head reveal pre">
              <div className="eyerule">
                <span className="lbl amber">[ Trust by architecture ]</span>
                <span className="ln" />
              </div>
              <h2>
                It lives where you work. <span className="dim">And stays quiet.</span>
              </h2>
              <p>
                Foldera is built to earn access, not assume it. Every guarantee below is structural — not a promise, but
                how the system is designed to work.
              </p>
            </div>
            <div className="princ reveal pre">
              {principles.map(([n, h, p]) => (
                <div className="prow" key={n}>
                  <span className="pn">{n}</span>
                  <div>
                    <h4>{h}</h4>
                    <p>{p}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CLOSING */}
        <section className="closing" id="cta" data-testid="landing-pilot">
          <Image
            className="mark closing-mark"
            src="/foldera-glyph.svg"
            alt=""
            width={300}
            height={300}
            unoptimized
            aria-hidden="true"
          />
          <div className="closing-glow" aria-hidden="true" />
          <div className="shell">
            <h2 className="reveal pre">
              Restore your continuity.<span className="dim">Get your day back.</span>
            </h2>
            <p className="reveal pre">
              Stop checking nine apps. Foldera keeps the thread and returns the one move that matters.
            </p>
            <div className="closing-cta reveal pre">
              <a href={accessHref} className="btn btn-primary" data-testid="landing-pilot-access-cta">
                Request access <ArrowRight style={{ width: 15, height: 15 }} aria-hidden="true" />
              </a>
              <a href="/demo" className="btn btn-ghost" data-testid="landing-demo-link">
                See the demo
              </a>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="ftr" data-testid="landing-footer">
          <div className="shell">
            <div className="ftr-grid">
              <div className="ftr-brand">
                <BrandLockup />
                <p>The Workday Presence Layer.</p>
                <div className="ftr-social">
                  <a href="/" aria-label="X">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                  <a href="/" aria-label="LinkedIn">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" />
                    </svg>
                  </a>
                  <a href="/" aria-label="Website">
                    <Globe style={{ width: 16, height: 16 }} aria-hidden="true" />
                  </a>
                </div>
              </div>
              {footerCols.map((col) => (
                <div className="ftr-col" key={col.title}>
                  <h4>{col.title}</h4>
                  {col.links.map((link) => (
                    <a href="#top" key={link}>
                      {link}
                    </a>
                  ))}
                </div>
              ))}
            </div>
            <div className="ftr-bot">© 2026 Foldera · The Workday Presence Layer</div>
          </div>
        </footer>
      </main>
    </div>
  );
}
