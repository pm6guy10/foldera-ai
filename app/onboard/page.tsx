'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    q: "What's the biggest decision you're wrestling with right now?",
    placeholder: "E.g. Whether to take the new role, move cities, leave the relationship...",
    prefix: 'Current decision:',
    category: 'career',
    priority: 5,
  },
  {
    q: 'What are you trying to achieve in the next 3–6 months?',
    placeholder: "Be specific — not 'be healthier', but 'run a half marathon by June'.",
    prefix: '3–6 month goal:',
    category: 'other',
    priority: 4,
  },
  {
    q: 'What keeps pulling you off track?',
    placeholder: 'The recurring distraction, habit, or anxiety that keeps showing up...',
    prefix: 'Recurring obstacle:',
    category: 'other',
    priority: 3,
  },
  {
    q: 'What would make this week a success?',
    placeholder: 'One concrete outcome that would feel like a win on Friday.',
    prefix: "This week's success:",
    category: 'other',
    priority: 2,
  },
  {
    q: "What's one thing you keep putting off that you know you should do?",
    placeholder: "The thing that's lived on your list for too long.",
    prefix: 'Deferred task:',
    category: 'other',
    priority: 1,
  },
] as const;

const ACTION_LABELS: Record<string, string> = {
  write_document: 'Write',
  send_message: 'Reach Out',
  make_decision: 'Decide',
  do_nothing: 'Wait',
  schedule: 'Schedule',
  research: 'Research',
};

const ACTION_COLORS: Record<string, string> = {
  write_document: 'text-blue-400 border-blue-400/40 bg-blue-400/10',
  send_message: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
  make_decision: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  do_nothing: 'text-violet-400 border-violet-400/40 bg-violet-400/10',
  schedule: 'text-cyan-400 border-cyan-400/40 bg-cyan-400/10',
  research: 'text-rose-400 border-rose-400/40 bg-rose-400/10',
};

const LOADING_MSGS = [
  'Reading your history...',
  'Identifying patterns...',
  'Weighing the evidence...',
  'Synthesizing directive...',
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface Directive {
  directive: string;
  action_type: string;
  confidence: number;
  reason: string;
  evidence: { type: string; description: string; date: string | null }[];
  fullContext?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getTempUserId(): string {
  const key = 'foldera_onboard_id';
  let id = sessionStorage.getItem(key);
  if (!id || !UUID_RE.test(id)) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function OnboardPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tempUserId, setTempUserId] = useState('');
  const [uploadText, setUploadText] = useState('');
  const [answers, setAnswers] = useState<string[]>(['', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [directive, setDirective] = useState<Directive | null>(null);
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [showEvidence, setShowEvidence] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Init temp user ID on mount (needs browser APIs)
  useEffect(() => {
    setTempUserId(getTempUserId());
  }, []);

  // Cycle loading messages while loading
  useEffect(() => {
    if (loading) {
      setLoadingMsgIdx(0);
      intervalRef.current = setInterval(() => {
        setLoadingMsgIdx(i => (i + 1) % LOADING_MSGS.length);
      }, 1800);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loading]);

  // Handle file upload — parse JSON or plain text
  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const raw = await file.text();
    try {
      const json = JSON.parse(raw);
      if (Array.isArray(json)) {
        // Flat message array: [{role, content}]
        setUploadText(
          json
            .map((m: any) => `${m.role || 'user'}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
            .join('\n\n')
        );
      } else if (json.conversations) {
        // Claude project export: {conversations: [{messages: [{role, content}]}]}
        setUploadText(
          json.conversations
            .map((conv: any) =>
              (conv.messages || [])
                .map((m: any) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
                .join('\n')
            )
            .join('\n\n---\n\n')
        );
      } else {
        setUploadText(raw);
      }
    } catch {
      setUploadText(raw);
    }
    e.target.value = '';
  }, []);

  // ── Step 1: process upload then advance ────────────────────────────────────
  const handleIngest = async () => {
    setError('');
    if (!uploadText.trim()) {
      setStep(2);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/onboard/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: uploadText, tempUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process export.');
      setStep(2);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: save goals then generate directive ─────────────────────────────
  const handleGenerate = async () => {
    const filled = answers.filter(a => a.trim());
    if (filled.length === 0) {
      setError('Answer at least one question first.');
      return;
    }
    setError('');
    setLoading(true);
    setStep(3);
    try {
      await fetch('/api/onboard/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, tempUserId }),
      });

      const res = await fetch('/api/onboard/directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempUserId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Directive generation failed.');
      }
      const data: Directive = await res.json();
      setDirective(data);
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Email capture ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await fetch('/api/onboard/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tempUserId }),
      });
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateAnswer = (i: number, val: string) => {
    setAnswers(prev => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#080808] text-[#f0ece4] flex flex-col items-center px-6 py-12">
      {/* Logo */}
      <a
        href="/"
        className="mb-12 font-serif text-xl text-[#f0ece4] hover:text-white transition-colors"
        style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
      >
        Foldera
      </a>

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-10">
        {([1, 2, 3] as const).map(n => (
          <div
            key={n}
            className="h-px w-10 transition-all duration-500"
            style={{ background: n <= step ? '#e8471c' : '#222220' }}
          />
        ))}
        <span
          className="ml-1 text-[10px] uppercase tracking-widest text-[#58534e]"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {step === 1 ? 'Upload' : step === 2 ? 'Goals' : 'Directive'}
        </span>
      </div>

      {/* Card */}
      <div className="w-full max-w-lg">

        {/* ── STEP 1: Upload ───────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1
                className="text-2xl leading-snug mb-2"
                style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
              >
                Drop your Claude export.
              </h1>
              <p className="text-sm text-[#a09890] leading-relaxed">
                Export any conversation from Claude.ai and paste the text below.
                Foldera extracts your decisions, patterns, and goals automatically.{' '}
                <span className="text-[#58534e]">Processed server-side, never shared.</span>
              </p>
            </div>

            <div className="relative">
              <textarea
                value={uploadText}
                onChange={e => setUploadText(e.target.value)}
                rows={8}
                placeholder="Paste conversation text here..."
                className="w-full bg-[#0e0e0e] border border-[#222220] p-4 text-sm text-[#f0ece4] placeholder-[#38342f] resize-none focus:outline-none focus:border-[#2e2c28] leading-relaxed"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}
              />
              {uploadText && (
                <button
                  onClick={() => setUploadText('')}
                  className="absolute top-3 right-3 text-[#58534e] hover:text-[#a09890] transition-colors text-sm"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label
                className="cursor-pointer text-[10px] uppercase tracking-widest text-[#58534e] hover:text-[#a09890] transition-colors underline underline-offset-4"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Upload .txt or .json
                <input type="file" accept=".txt,.json,.md" className="hidden" onChange={handleFile} />
              </label>
              {error && <p className="text-[#e8471c] text-xs">{error}</p>}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => { setError(''); setStep(2); }}
                className="text-xs text-[#58534e] hover:text-[#a09890] underline underline-offset-4 transition-colors"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Skip — just answer the questions →
              </button>
              <button
                onClick={handleIngest}
                disabled={loading}
                className="text-[10px] uppercase tracking-widest px-6 py-3 bg-[#f0ece4] text-[#080808] hover:bg-[#e8471c] hover:text-[#f0ece4] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {loading ? 'Processing...' : uploadText ? 'Analyze →' : 'Continue →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Goals ────────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1
                className="text-2xl leading-snug mb-2"
                style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
              >
                Five questions.
              </h1>
              <p className="text-sm text-[#a09890]">
                Answer in plain English. Rough is fine — the engine reads between the lines.
              </p>
            </div>

            <div className="space-y-5">
              {QUESTIONS.map((item, i) => (
                <div key={i} className="space-y-1.5">
                  <label
                    className="block text-[10px] uppercase tracking-widest text-[#58534e]"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {String(i + 1).padStart(2, '0')} — {item.q}
                  </label>
                  <textarea
                    value={answers[i]}
                    onChange={e => updateAnswer(i, e.target.value)}
                    rows={2}
                    placeholder={item.placeholder}
                    className="w-full bg-[#0e0e0e] border border-[#222220] p-3 text-sm text-[#f0ece4] placeholder-[#38342f] resize-none focus:outline-none focus:border-[#2e2c28] leading-relaxed"
                  />
                </div>
              ))}
            </div>

            {error && <p className="text-[#e8471c] text-xs">{error}</p>}

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => { setError(''); setStep(1); }}
                className="text-xs text-[#58534e] hover:text-[#a09890] underline underline-offset-4 transition-colors"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                ← Back
              </button>
              <button
                onClick={handleGenerate}
                className="text-[10px] uppercase tracking-widest px-6 py-3 bg-[#e8471c] text-[#f0ece4] hover:bg-[#ff6b3d] transition-colors"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Generate my directive →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Loading / Directive ──────────────────────────────────── */}
        {step === 3 && (
          <>
            {loading && (
              <div className="flex flex-col items-center justify-center py-24 space-y-6">
                <div
                  className="w-px bg-gradient-to-b from-transparent to-[#e8471c] animate-pulse"
                  style={{ height: 64 }}
                />
                <p
                  className="text-[10px] uppercase tracking-widest text-[#58534e] transition-all duration-700"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {LOADING_MSGS[loadingMsgIdx]}
                </p>
              </div>
            )}

            {!loading && directive && (
              <div className="space-y-4">
                {/* Directive card */}
                <div className="border border-[#222220] bg-[#0e0e0e] p-6 space-y-4">
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border ${ACTION_COLORS[directive.action_type] ?? 'text-[#a09890] border-[#222220] bg-transparent'}`}
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {ACTION_LABELS[directive.action_type] ?? directive.action_type}
                    </span>
                    <span
                      className="text-xs text-[#58534e]"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {directive.confidence}% confidence
                    </span>
                  </div>

                  {/* Directive text */}
                  <p
                    className="text-xl leading-relaxed text-[#f0ece4]"
                    style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
                  >
                    {directive.directive}
                  </p>

                  {/* Reason */}
                  <p className="text-sm text-[#a09890] leading-relaxed border-t border-[#1a1917] pt-4">
                    {directive.reason}
                  </p>

                  {/* Evidence toggle */}
                  {directive.evidence?.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowEvidence(v => !v)}
                        className="text-[10px] uppercase tracking-widest text-[#58534e] hover:text-[#a09890] transition-colors"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {showEvidence ? 'Hide' : 'Show'} evidence ({directive.evidence.length})
                      </button>
                      {showEvidence && (
                        <ul className="mt-3 space-y-2">
                          {directive.evidence.map((ev, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[#58534e]">
                              <span className="text-[#e8471c] mt-0.5 flex-shrink-0">·</span>
                              <span>
                                {ev.date && (
                                  <span
                                    className="mr-1 text-[#38342f]"
                                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                                  >
                                    [{ev.date}]
                                  </span>
                                )}
                                {ev.description}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Full context */}
                {directive.fullContext && (
                  <p className="text-xs text-[#58534e] leading-relaxed px-1">
                    {directive.fullContext}
                  </p>
                )}

                {/* Email capture */}
                <div className="border border-[#222220] bg-[#0e0e0e] p-6 space-y-4">
                  {saved ? (
                    <div className="space-y-2">
                      <p className="text-sm text-[#a09890] flex items-center gap-2">
                        <span className="text-[#e8471c]">✓</span>
                        Saved. Your first morning brief is on its way.
                      </p>
                      <a
                        href="/api/auth/signin"
                        className="text-xs text-[#f0ece4] underline underline-offset-4 hover:text-[#e8471c] transition-colors"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        Sign in to unlock the full dashboard →
                      </a>
                    </div>
                  ) : (
                    <>
                      <p
                        className="text-[10px] uppercase tracking-widest text-[#58534e]"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        Save this + get a brief every morning
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSave()}
                          placeholder="you@example.com"
                          className="flex-1 bg-[#080808] border border-[#222220] px-3 py-2.5 text-sm text-[#f0ece4] placeholder-[#38342f] focus:outline-none focus:border-[#2e2c28]"
                        />
                        <button
                          onClick={handleSave}
                          disabled={loading}
                          className="text-[10px] uppercase tracking-widest px-4 py-2.5 bg-[#f0ece4] text-[#080808] hover:bg-[#e8471c] hover:text-[#f0ece4] transition-colors disabled:opacity-40"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {loading ? '...' : 'Save →'}
                        </button>
                      </div>
                      {error && <p className="text-[#e8471c] text-xs">{error}</p>}
                    </>
                  )}
                </div>
              </div>
            )}

            {!loading && !directive && error && (
              <div className="flex flex-col items-center py-20 space-y-4 text-center">
                <p className="text-sm text-[#e8471c]">{error}</p>
                <button
                  onClick={() => { setStep(2); setError(''); }}
                  className="text-xs text-[#58534e] underline underline-offset-4 hover:text-[#a09890] transition-colors"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  ← Go back and try again
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
