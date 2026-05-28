import React, { useState } from 'react';

// Static base assets for Foldera visuals
const assetBase = 'https://raw.githubusercontent.com/pm6guy10/foldera-ai/main/public/landing/mobile-sections';

const panels = [
  { src: `${assetBase}/01.jpg`, alt: 'Foldera opening product story', cta: { left: 25, top: 62.5, width: 47, height: 7 } },
  { src: `${assetBase}/02.jpg`, alt: 'Foldera reconstruction tax visual' },
  { src: `${assetBase}/03.jpg`, alt: 'Foldera presence layer visual' },
  { src: `${assetBase}/04.jpg`, alt: 'Foldera state versus ping visual' },
  { src: `${assetBase}/05.jpg`, alt: 'Foldera in-workflow visual' },
  { src: `${assetBase}/06.jpg`, alt: 'Foldera restore continuity visual', cta: { left: 12, top: 77.8, width: 75, height: 8.6 } },
];

const nav = ['Product', 'Workflow', 'Proof', 'Pilot'];
const logos = ['Slack', 'Gmail', 'Docs', 'Calendar', 'Teams', 'Sheets'];

const sections = [
  {
    kicker: '01 / Reconstruction tax',
    title: 'Stop paying humans to rebuild context.',
    body: 'Every tool holds one fragment. Foldera keeps the thread, file, meeting, blocker, and approval state together so work resumes with the context intact.',
    image: panels[1],
  },
  {
    kicker: '02 / Presence layer',
    title: 'One ecosystem-neutral layer remembers the workday.',
    body: 'Microsoft remembers Microsoft. Google remembers Google. Foldera remembers the cross-app state that actually determines the next move.',
    image: panels[2],
  },
  {
    kicker: '03 / Actual state',
    title: 'Turn noisy pings into one ready action.',
    body: 'Foldera watches consented signals and collapses them into one Right Now answer with evidence attached and approval still in human hands.',
    image: panels[3],
  },
  {
    kicker: '04 / Work habitat',
    title: 'It lives where the work already happens.',
    body: 'No new dashboard to babysit. Foldera appears inside the flow, only when there is a clean moment to act, then gets out of the way.',
    image: panels[4],
  },
];

const previewStates = [
  {
    id: 'contract',
    label: 'Contract v4 approved',
    verdict: 'Do this',
    verdictColor: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
    whyItMatters: 'The approval exists, but the send step is still waiting.',
    sourceTrail: ['Slack approval', 'contract-v4-final.docx', 'Calendar follow-up'],
    attachedContext: 'Legal approved v4 after pricing edits.',
    nextSafeAction: 'Review the prepared customer note.',
  },
  {
    id: 'reply',
    label: 'Customer reply ready',
    verdict: 'Do this',
    verdictColor: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
    whyItMatters: 'The customer is waiting and the answer is already assembled.',
    sourceTrail: ['Gmail thread', 'proposal-draft.pdf', 'Meeting notes'],
    attachedContext: 'The draft references the agreed timeline and open pricing question.',
    nextSafeAction: 'Approve or edit the reply.',
  },
  {
    id: 'followup',
    label: 'Meeting follow-up blocked',
    verdict: 'Fix this first',
    verdictColor: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    whyItMatters: 'The next step depends on one missing owner.',
    sourceTrail: ['Calendar meeting', 'meeting-recap.md', 'Slack thread'],
    attachedContext: 'Follow-up is ready except for the implementation owner.',
    nextSafeAction: 'Assign the owner before sending the recap.',
  },
  {
    id: 'clear',
    label: 'You’re clear right now',
    verdict: 'You’re clear right now',
    verdictColor: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    whyItMatters: 'Foldera checked the connected sources and found no safe interruption.',
    sourceTrail: ['Calendar', 'Slack', 'Gmail', 'Docs'],
    attachedContext: 'No approval, blocker, or reply-needed event is ready.',
    nextSafeAction: 'Stay on your current work.',
  }
];

function LogoMark() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-white text-[13px] font-black text-black">F</span>
      <span className="text-[13px] font-semibold tracking-[0.14em] text-white">FOLDERA</span>
    </div>
  );
}

function PanelImage({ panel, hero = false }) {
  return (
    <div className={`relative overflow-hidden rounded-[18px] border border-white/10 bg-black shadow-[0_40px_140px_rgba(0,0,0,0.72)] ${hero ? 'mx-auto max-w-[860px]' : 'w-full'}`}>
      <img src={panel.src} alt={panel.alt} className="block h-auto w-full select-none" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.05),transparent_35%)]" aria-hidden="true" />
      {panel.cta ? (
        <a
          href="/start"
          aria-label="Join the pilot"
          className="absolute z-10 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 transition-all duration-200"
          style={{ left: `${panel.cta.left}%`, top: `${panel.cta.top}%`, width: `${panel.cta.width}%`, height: `${panel.cta.height}%` }}
        />
      ) : null}
    </div>
  );
}

function FeatureSection({ section, index }) {
  const flip = index % 2 === 1;

  return (
    <section className="border-t border-white/10 px-5 py-24 sm:px-8 lg:px-12">
      <div className={`mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center ${flip ? 'lg:[&>*:first-child]:order-2' : ''}`}>
        <div className="max-w-[460px]">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">{section.kicker}</p>
          <h2 className="mt-4 text-[clamp(2.4rem,6vw,4.9rem)] font-black uppercase leading-[0.82] tracking-[-0.08em] text-white">{section.title}</h2>
          <p className="mt-6 text-[15px] leading-[1.75] text-slate-400">{section.body}</p>
        </div>
        <PanelImage panel={section.image} />
      </div>
    </section>
  );
}

function ProofGrid() {
  return (
    <section className="border-t border-white/10 px-5 py-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1180px]">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">Pilot truth</p>
            <h2 className="mt-4 text-[clamp(2.5rem,7vw,5.4rem)] font-black uppercase leading-[0.8] tracking-[-0.08em] text-white">Built to stay quiet.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['No auto-send', 'Foldera prepares the work. The human still approves.'],
              ['No new dashboard', 'The product appears in the work habitat, not another queue.'],
              ['No fake certainty', 'Evidence stays attached to every recommendation.'],
              ['No surveillance', 'Foldera uses consented connectors and explicit work state, not hidden screen-reading.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                <h3 className="text-[15px] font-bold text-white">{title}</h3>
                <p className="mt-2 text-[13px] leading-[1.6] text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function InteractivePreview() {
  const [activeStateId, setActiveStateId] = useState('contract');
  const activeState = previewStates.find(s => s.id === activeStateId) || previewStates[0];

  return (
    <section className="border-t border-white/10 px-5 py-24 sm:px-8 lg:px-12 bg-gradient-to-b from-transparent to-[#070707]">
      <div className="mx-auto max-w-[1180px]">
        <div className="text-center max-w-[720px] mx-auto mb-16">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">Live Simulation</p>
          <h2 className="mt-4 text-[clamp(2.2rem,5vw,4.5rem)] font-black uppercase leading-[0.85] tracking-[-0.08em] text-white">
            See Foldera's Core Loop
          </h2>
          <p className="mt-4 text-[16px] text-slate-400 leading-[1.6]">
            Select different scatterings of everyday work state to preview how Foldera structures the truth and hands back your next move.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] items-stretch">
          {/* State Switcher Buttons */}
          <div className="flex flex-col gap-3 justify-center">
            {previewStates.map((state) => {
              const isActive = state.id === activeStateId;
              return (
                <button
                  key={state.id}
                  onClick={() => setActiveStateId(state.id)}
                  aria-pressed={isActive}
                  data-testid={`preview-tab-${state.id}`}
                  className={`w-full text-left p-5 rounded-2xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                    isActive
                      ? 'bg-white/[0.04] border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.02)]'
                      : 'bg-transparent border-white/5 hover:bg-white/[0.02] hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[15px] font-semibold tracking-tight ${isActive ? 'text-white' : 'text-slate-400'}`}>
                      {state.label}
                    </span>
                    <span className={`h-2 w-2 rounded-full transition-all duration-300 ${isActive ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-transparent'}`} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Dynamic Render Surface */}
          <div className="relative rounded-3xl border border-white/10 bg-zinc-950/40 p-6 sm:p-8 shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex flex-col justify-between overflow-hidden backdrop-blur-md min-h-[380px]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.08),transparent_50%)]" aria-hidden="true" />

            <div>
              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">TODAY'S ANSWER</span>
                </div>
                <div data-testid="verdict-badge" className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold tracking-tight ${activeState.verdictColor}`}>
                  {activeState.verdict}
                </div>
              </div>

              <div className="mb-6">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2.5">Source Trail</span>
                <div className="flex flex-wrap gap-2">
                  {activeState.sourceTrail.map((source, index) => (
                    <span key={index} className="text-[11px] bg-white/[0.03] border border-white/5 text-slate-300 px-2.5 py-1 rounded-md tracking-tight font-medium">
                      {source}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Attached Context</span>
                <p data-testid="attached-context" className="text-[14px] text-slate-300 leading-relaxed font-medium">
                  {activeState.attachedContext}
                </p>
              </div>

              <div className="mb-4">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Next Safe Action</span>
                <div className="p-3.5 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.02]">
                  <p data-testid="next-safe-action" className="text-[13px] text-cyan-300 font-semibold leading-relaxed">
                    {activeState.nextSafeAction}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
                <span className="text-[12px] font-bold text-slate-400 tracking-tight">Nothing was sent.</span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">State: Secure</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TodayAnswerSection() {
  return (
    <section className="border-t border-white/10 px-5 py-24 sm:px-8 lg:px-12 bg-black relative overflow-hidden">
      <div className="mx-auto max-w-[1180px]">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">Decision Engine</p>
            <h2 className="mt-4 text-[clamp(2.4rem,6vw,4.9rem)] font-black uppercase leading-[0.82] tracking-[-0.08em] text-white">
              Exactly Three Verdict Concepts.
            </h2>
            <p className="mt-6 text-[15px] leading-[1.7] text-slate-400">
              No endless notifications. No dashboard scrolling. Foldera watches your integrations and only surfaces three explicit core states:
            </p>
            
            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-4">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-cyan-400" />
                <div>
                  <h4 className="text-[14px] font-bold text-white uppercase tracking-tight">Do this</h4>
                  <p className="text-[13px] text-slate-400 mt-0.5">An action is completely packaged, authorized, and awaiting review.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-amber-400" />
                <div>
                  <h4 className="text-[14px] font-bold text-white uppercase tracking-tight">Fix this first</h4>
                  <p className="text-[13px] text-zinc-400 mt-0.5">A critical dependency is broken or an explicit owner is unassigned.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-400" />
                <div>
                  <h4 className="text-[14px] font-bold text-white uppercase tracking-tight">You’re clear right now</h4>
                  <p className="text-[13px] text-slate-400 mt-0.5">The sources are checked and there are zero disruptions ready for you.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 sm:p-10 relative flex flex-col justify-center overflow-hidden">
            <p data-testid="lock-copy-1" className="text-[15px] text-slate-300 leading-relaxed font-semibold">
              "Foldera checked your connected sources."
            </p>
            <p data-testid="lock-copy-2" className="text-[15px] text-slate-300 leading-relaxed font-semibold mt-2">
              "You do not need to sort through this pile right now."
            </p>
            <p data-testid="lock-copy-3" className="text-[15px] text-cyan-300 leading-relaxed font-bold mt-2">
              "Nothing was sent."
            </p>
            
            <div className="mt-8 pt-6 border-t border-white/5 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-zinc-500 font-bold uppercase tracking-wider">
              <span>✓ Active Signals</span>
              <span>✓ Ecosystem-Neutral</span>
              <span>✓ Human Controlled</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function FolderaLandingPreview() {
  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#030303] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <LogoMark />
          <nav className="hidden items-center gap-7 text-[12px] text-slate-400 md:flex">
            {nav.map((item) => (
              <span key={item} className="hover:text-white transition-colors duration-200 cursor-pointer">{item}</span>
            ))}
          </nav>
          <a href="/start" className="rounded-full bg-white px-4 py-2 text-[11px] font-black text-black">Join pilot</a>
        </div>
      </header>

      <section className="relative overflow-hidden px-5 pb-16 pt-20 sm:px-8 lg:px-12">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute left-1/2 top-[-22rem] h-[54rem] w-[54rem] -translate-x-1/2 rounded-full bg-white/5 blur-[160px]" />
          <div className="absolute bottom-[-18rem] left-1/2 h-[42rem] w-[72rem] -translate-x-1/2 rounded-full bg-cyan-400/[0.06] blur-[180px]" />
        </div>

        <div className="relative mx-auto max-w-[1180px]">
          <div className="max-w-[720px] pb-12">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">Workday Presence Layer</p>
            <h1 className="mt-5 text-[clamp(3.3rem,9vw,7.6rem)] font-black uppercase leading-[0.78] tracking-[-0.09em] text-white">
              Operational memory for broken work.
            </h1>
            <p className="mt-6 max-w-[590px] text-[17px] leading-[1.7] text-slate-300">
              Foldera keeps the state of work attached across apps, meetings, files, and approvals so the next move comes back ready to review.
            </p>
            <div className="mt-8 flex gap-3">
              <a href="/start" className="rounded-full bg-white px-5 py-3 text-[12px] font-black text-black">Join pilot</a>
              <button className="rounded-full border border-white/15 px-5 py-3 text-[12px] font-bold text-white transition-colors hover:bg-white/5">
                See product
              </button>
            </div>
          </div>
          <PanelImage panel={panels[0]} hero />
        </div>
      </section>

      <section className="border-y border-white/10 px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-5 opacity-55">
          {logos.map((logo) => (
            <span key={logo} className="text-[12px] font-bold uppercase tracking-[0.16em] text-zinc-300">{logo}</span>
          ))}
        </div>
      </section>

      <InteractivePreview />

      <section className="px-5 py-20 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">The Reconstruction Tax</p>
            <h2 className="mt-4 text-[clamp(2.4rem,6vw,4.9rem)] font-black uppercase leading-[0.82] tracking-[-0.08em] text-white">
              Purpose-built for teams whose work state breaks across tools.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Context memory', 'Stop rebuilding what already happened.', 'Foldera preserves the cross-app state that actually determines your team’s next move.'],
              ['Presence layer', 'One ecosystem-neutral layer.', 'A neutral observer that bridges information safely between Microsoft, Google, Slack, and your internal logs.'],
              ['Approval proof', 'Evidence stays attached.', 'Nothing is triggered or executed automatically. Complete audit trail remains attached for the human operator.']
            ].map(([title, subtitle, desc]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.015] p-6 flex flex-col justify-between min-h-[220px]">
                <div>
                  <h3 className="text-[14px] font-bold text-white">{title}</h3>
                  <p className="mt-1 text-[12px] font-bold text-cyan-300">{subtitle}</p>
                </div>
                <p className="mt-4 text-[12px] leading-[1.6] text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {sections.map((section, index) => (
        <FeatureSection key={section.kicker} section={section} index={index} />
      ))}

      <TodayAnswerSection />

      <section className="border-t border-white/10 px-5 py-24 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">Final state</p>
            <h2 className="mt-4 text-[clamp(2.6rem,7vw,5.6rem)] font-black uppercase leading-[0.8] tracking-[-0.08em] text-white">Restore your continuity.</h2>
            <p className="mt-6 text-[15px] leading-[1.75] text-slate-400">Stop acting as the human integration layer. Let Foldera hold the context so the team can do the work.</p>
          </div>
          <PanelImage panel={panels[5]} />
        </div>
      </section>

      <ProofGrid />

      <footer className="border-t border-white/10 px-5 py-20 text-center sm:px-8 lg:px-12 relative bg-black">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(34,211,238,0.03),transparent_60%)]" aria-hidden="true" />
        
        <div className="relative mx-auto max-w-[800px]">
          <h2 className="text-[clamp(2.6rem,7vw,5.5rem)] font-black uppercase leading-[0.8] tracking-[-0.08em] text-white">Built for broken workdays. Ready for pilot use.</h2>
          <div className="mt-8 flex justify-center gap-3">
            <a href="/start" className="rounded-full bg-white px-5 py-3 text-[12px] font-black text-black">Join pilot</a>
            <button className="rounded-full border border-white/15 px-5 py-3 text-[12px] font-bold text-white transition-colors hover:bg-white/5">See product</button>
          </div>
          
          <p className="mt-12 text-[11px] text-zinc-500 font-medium tracking-wide uppercase">
            One answer. Context attached. Nothing sent automatically.
          </p>
        </div>
      </footer>
    </main>
  );
}
