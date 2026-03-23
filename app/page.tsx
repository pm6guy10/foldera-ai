import Link from 'next/link';
import {
  ArrowRight,
  Calendar,
  Check,
  ChevronRight,
  Clock3,
  Lock,
  Mail,
  Shield,
  Sparkles,
} from 'lucide-react';

const steps = [
  {
    title: 'Connect your inbox and calendar',
    body: 'Foldera reads the flow you already live in. No new workspace. No prompt-writing. No extra ritual.',
  },
  {
    title: 'Foldera chooses the one thread that should move',
    body: 'It looks for urgency, stakes, and patterns in what you keep postponing — then ignores the rest.',
  },
  {
    title: 'You wake up to one prepared move',
    body: 'A drafted email, decision frame, or document lands in front of you. Approve it or skip it. Done.',
  },
];

const objections = [
  'Not another app to babysit',
  'Not a chatbot waiting for instructions',
  'Not a summary of 19 things you still have to do yourself',
];

const productBullets = [
  'One directive each morning',
  'Drafted emails, decision frames, and documents',
  'Google or Microsoft login',
  'Approve or skip in one tap',
  'Encrypted at rest',
  'Learns from every approval and skip',
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#06070b] text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.08),transparent_20%)]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_45%,transparent_85%)]" />

      <header className="sticky top-0 z-20 border-b border-white/6 bg-[#06070b]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-black tracking-tight">
            Foldera
          </Link>
          <div className="flex items-center gap-5 text-sm text-zinc-400">
            <Link href="/pricing" className="hidden hover:text-white sm:inline-flex">
              Pricing
            </Link>
            <Link href="/login" className="hidden hover:text-white sm:inline-flex">
              Sign in
            </Link>
            <Link
              href="/start"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Get started
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" />
            One prepared move every morning
          </div>

          <h1 className="mt-6 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl lg:leading-[1.02]">
            Wake up to the one thing that should move today.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-xl">
            Foldera reads your email and calendar overnight, picks the thread that matters most, and prepares the work before you wake up.
          </p>

          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
            You do not manage another inbox. You do not chat with a bot. You get one clear directive with the artifact already attached — approve it or skip it.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/start"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
            >
              See pricing
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap gap-4 text-sm text-zinc-400">
            <span className="inline-flex items-center gap-2">
              <Lock className="h-4 w-4 text-zinc-500" />
              Encrypted at rest
            </span>
            <span className="inline-flex items-center gap-2">
              <Shield className="h-4 w-4 text-zinc-500" />
              Never sends without approval
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-zinc-500" />
              First read arrives at 7am Pacific
            </span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 rounded-[2rem] bg-cyan-400/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/90 p-4 shadow-2xl shadow-black/40">
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  What Foldera sees
                </p>
                <div className="mt-4 space-y-3">
                  {[
                    { icon: Mail, label: 'Recruiter follow-up', meta: 'Unread · 3 days old' },
                    { icon: Calendar, label: 'Interview debrief tomorrow', meta: '9:00 AM Pacific' },
                    { icon: Mail, label: 'Draft never sent', meta: 'Saved Friday night' },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="rounded-2xl border border-white/8 bg-zinc-900/80 p-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-xl bg-white/5 p-2">
                            <Icon className="h-4 w-4 text-zinc-300" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{item.label}</p>
                            <p className="mt-1 text-xs text-zinc-500">{item.meta}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-cyan-400/20 bg-gradient-to-b from-cyan-400/10 to-white/[0.02] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                      Your 7:00 AM directive
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
                      Reply to the recruiter today.
                    </p>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                    ready
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-zinc-300">
                  Foldera saw repeated hesitation around this role, the timing pressure in your inbox, and tomorrow&apos;s calendar context. It prepared the move instead of giving you another reminder.
                </p>

                <div className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Prepared artifact</p>
                  <p className="mt-3 text-xs text-zinc-400">To: recruiter@company.com</p>
                  <p className="mt-1 text-sm font-medium text-white">Subject: Following up on the operations role</p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-300">
                    Hi Sarah,

                    I&apos;ve been thinking seriously about the role and I&apos;d like to move forward. I&apos;m available tomorrow after 1 PM Pacific if you want to talk through next steps.

                    Best,
                    Brandon
                  </p>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-emerald-500 px-4 py-3 text-center text-sm font-semibold text-white">
                    Approve
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-zinc-300">
                    Skip
                  </div>
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                  Approve executes the prepared work. Skip teaches Foldera what not to surface next time.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid gap-4 rounded-[2rem] border border-white/8 bg-white/[0.03] p-6 md:grid-cols-3">
          {objections.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-zinc-950/60 p-4">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <p className="text-sm leading-6 text-zinc-300">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">How it works</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Simple enough to explain in one breath.
          </h2>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">0{index + 1}</p>
              <h3 className="mt-4 text-xl font-semibold text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-7 text-zinc-400">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 rounded-[2rem] border border-white/8 bg-zinc-950/70 p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Pricing</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
              One plan. One job.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-zinc-400">
              Foldera is not trying to be your notes app, task board, or inbox client. It is a morning decision product. The price should feel as simple as the interaction model.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-cyan-400/20 bg-gradient-to-b from-cyan-400/10 to-white/[0.02] p-6">
            <div className="flex items-end gap-3">
              <span className="text-6xl font-black tracking-tight text-white">$29</span>
              <span className="pb-2 text-sm uppercase tracking-[0.18em] text-zinc-500">/ month</span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">Free forever. Artifacts unlock at $29/mo.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {productBullets.map((bullet) => (
                <div key={bullet} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-zinc-950/60 p-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                  <p className="text-sm text-zinc-300">{bullet}</p>
                </div>
              ))}
            </div>
            <Link
              href="/start"
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
