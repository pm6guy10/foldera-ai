'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'intro' | 'q1' | 'q2' | 'q3' | 'generating' | 'directive';

interface Directive {
  directive: string;
  action_type: string;
  confidence: number;
  reason: string;
  evidence: { type: string; description: string; date: string | null }[];
  fullContext?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GENERATION_MSGS = [
  'Finding your patterns...',
  'Reading between the lines...',
  'Almost there...',
];

const ACTION_LABELS: Record<string, string> = {
  write_document: 'WRITE',
  send_message: 'REACH OUT',
  make_decision: 'DECIDE',
  do_nothing: 'WAIT',
  schedule: 'SCHEDULE',
  research: 'RESEARCH',
};

// ─── Fonts (inline CSS to avoid layout dependency) ───────────────────────────

const FONT_SERIF = '"Instrument Serif", Georgia, "Times New Roman", serif';
const FONT_MONO = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';
const FONT_SANS = '"Syne", system-ui, -apple-system, sans-serif';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTempUserId(): string {
  const key = 'foldera_onboard_id';
  let id = sessionStorage.getItem(key);
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function OnboardPage() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [visible, setVisible] = useState(false);
  const [tempUserId, setTempUserId] = useState('');

  const [introText, setIntroText] = useState('');
  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [q3, setQ3] = useState('');

  const [directive, setDirective] = useState<Directive | null>(null);
  const [genMsgIdx, setGenMsgIdx] = useState(0);

  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [fileUploading, setFileUploading] = useState(false);

  const ingestRef = useRef<Promise<unknown> | null>(null);
  const introRef = useRef<HTMLTextAreaElement>(null);
  const q1Ref = useRef<HTMLTextAreaElement>(null);
  const q2Ref = useRef<HTMLTextAreaElement>(null);
  const q3Ref = useRef<HTMLTextAreaElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Init temp user ID on client only
  useEffect(() => { setTempUserId(getTempUserId()); }, []);

  // Fade-in on phase change
  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 40);
    return () => clearTimeout(t);
  }, [phase]);

  // Auto-focus on phase change
  useEffect(() => {
    const map: Partial<Record<Phase, React.RefObject<HTMLElement | null>>> = {
      intro: introRef, q1: q1Ref, q2: q2Ref, q3: q3Ref, directive: emailRef,
    };
    const ref = map[phase];
    if (ref?.current) {
      const t = setTimeout(() => (ref.current as HTMLElement)?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Cycle generation messages
  useEffect(() => {
    if (phase !== 'generating') return;
    setGenMsgIdx(0);
    const t = setInterval(() => setGenMsgIdx(i => (i + 1) % GENERATION_MSGS.length), 2200);
    return () => clearInterval(t);
  }, [phase]);

  // Handle file upload — parse and ingest in background while user answers questions
  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileUploading(true);
    e.target.value = '';
    try {
      const raw = await file.text();
      let text = raw;
      try {
        const json = JSON.parse(raw);
        if (Array.isArray(json)) {
          text = json.map((m: { role?: string; content: unknown }) =>
            `${m.role ?? 'user'}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
          ).join('\n\n');
        } else if (json.conversations) {
          text = (json.conversations as { messages?: { role: string; content: unknown }[] }[])
            .map(c => (c.messages ?? []).map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n'))
            .join('\n\n---\n\n');
        }
      } catch { /* plain text — use as-is */ }

      if (text.trim().length >= 50) {
        ingestRef.current = fetch('/api/onboard/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, tempUserId }),
        }).catch(err => console.warn('[onboard] background ingest error', err));
      }
    } catch { /* ignore file read errors */ }
    setFileUploading(false);
  }, [tempUserId]);

  // ── Step transitions ──────────────────────────────────────────────────────

  const goTo = (p: Phase) => { setError(''); setPhase(p); };

  const handleGenerate = async () => {
    setPhase('generating');
    setGenMsgIdx(0);
    try {
      if (ingestRef.current) { await ingestRef.current; ingestRef.current = null; }

      await fetch('/api/onboard/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: [introText, q1, q2, q3, ''], tempUserId }),
      });

      const res = await fetch('/api/onboard/directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempUserId }),
      });

      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Generation failed.'); }
      setDirective(await res.json() as Directive);
      setPhase('directive');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('q3');
    }
  };

  const handleSave = async () => {
    if (!email.includes('@')) { setError('Enter a valid email.'); return; }
    setError('');
    try {
      await fetch('/api/onboard/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tempUserId }),
      });
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  // ── Shared styles ─────────────────────────────────────────────────────────

  const fade: React.CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(18px)',
    transition: 'opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1)',
  };

  const inputBase: React.CSSProperties = {
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #1e1c18',
    outline: 'none',
    color: '#f0ece4',
    fontSize: '1.125rem',
    fontFamily: FONT_SANS,
    lineHeight: 1.75,
    padding: '0.75rem 0',
    resize: 'none',
    caretColor: '#e8471c',
  };

  const ghostBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: FONT_MONO,
    fontSize: '0.7rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    transition: 'color 0.25s',
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Load matching fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400;500&family=Syne:wght@400;500;600&display=swap');
        ::placeholder { color: #38342f; }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: '#080808',
        color: '#f0ece4',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        position: 'relative',
      }}>
        {/* Logo */}
        <a href="/" style={{
          position: 'absolute', top: '2rem', left: '2.5rem',
          fontFamily: FONT_SERIF, fontSize: '1.1rem',
          color: '#f0ece4', textDecoration: 'none', opacity: 0.5,
          transition: 'opacity 0.2s',
        }}>
          Foldera
        </a>

        {/* ── INTRO ─────────────────────────────────────────────────────── */}
        {phase === 'intro' && (
          <div style={{ ...fade, width: '100%', maxWidth: '640px', textAlign: 'center' }}>
            <h1 style={{
              fontFamily: FONT_SERIF,
              fontSize: 'clamp(2.25rem, 6vw, 3.75rem)',
              lineHeight: 1.12,
              letterSpacing: '-0.02em',
              marginBottom: '2.75rem',
              fontWeight: 400,
            }}>
              What&rsquo;s been on<br />your mind lately?
            </h1>

            <textarea
              ref={introRef}
              value={introText}
              onChange={e => setIntroText(e.target.value)}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (introText.trim()) goTo('q1'); }
              }}
              placeholder="Just type. Foldera figures out the rest."
              rows={4}
              style={{ ...inputBase, textAlign: 'center', fontSize: '1.05rem' }}
            />

            <div style={{ marginTop: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
              <button
                onClick={() => introText.trim() && goTo('q1')}
                style={{
                  ...ghostBtn,
                  color: introText.trim() ? '#f0ece4' : '#38342f',
                  fontSize: '0.75rem',
                  padding: '0.5rem 1.5rem',
                }}
              >
                Show me what you see →
              </button>

              <label style={{ cursor: 'pointer', color: '#3a3630', fontSize: '0.7rem', fontFamily: FONT_MONO, letterSpacing: '0.08em', transition: 'color 0.2s' }}>
                {fileUploading ? 'uploading...' : 'or upload a Claude export'}
                <input type="file" accept=".txt,.json,.md" style={{ display: 'none' }} onChange={handleFile} />
              </label>
            </div>
          </div>
        )}

        {/* ── Q1 ────────────────────────────────────────────────────────── */}
        {phase === 'q1' && (
          <QuestionScreen
            style={fade}
            num="01" total="03"
            question={"What are you trying to\nmake happen in the\nnext 90 days?"}
            value={q1}
            onChange={setQ1}
            inputRef={q1Ref}
            onNext={() => q1.trim() && goTo('q2')}
            inputBase={inputBase}
            ghostBtn={ghostBtn}
            FONT_SERIF={FONT_SERIF}
            FONT_MONO={FONT_MONO}
          />
        )}

        {/* ── Q2 ────────────────────────────────────────────────────────── */}
        {phase === 'q2' && (
          <QuestionScreen
            style={fade}
            num="02" total="03"
            question={"What keeps getting\nin your way?"}
            value={q2}
            onChange={setQ2}
            inputRef={q2Ref}
            onNext={() => q2.trim() && goTo('q3')}
            inputBase={inputBase}
            ghostBtn={ghostBtn}
            FONT_SERIF={FONT_SERIF}
            FONT_MONO={FONT_MONO}
          />
        )}

        {/* ── Q3 ────────────────────────────────────────────────────────── */}
        {phase === 'q3' && (
          <QuestionScreen
            style={fade}
            num="03" total="03"
            question={"What does a win\nlook like for you?"}
            value={q3}
            onChange={setQ3}
            inputRef={q3Ref}
            onNext={() => q3.trim() && handleGenerate()}
            isLast
            error={error}
            inputBase={inputBase}
            ghostBtn={ghostBtn}
            FONT_SERIF={FONT_SERIF}
            FONT_MONO={FONT_MONO}
          />
        )}

        {/* ── GENERATING ────────────────────────────────────────────────── */}
        {phase === 'generating' && (
          <div style={{ ...fade, textAlign: 'center' }}>
            <p style={{
              fontFamily: FONT_SERIF,
              fontSize: 'clamp(1.25rem, 3.5vw, 1.75rem)',
              color: '#58534e',
              fontStyle: 'italic',
              fontWeight: 400,
              letterSpacing: '0.01em',
            }}>
              {GENERATION_MSGS[genMsgIdx]}
            </p>
          </div>
        )}

        {/* ── DIRECTIVE ─────────────────────────────────────────────────── */}
        {phase === 'directive' && directive && (
          <div style={{ ...fade, width: '100%', maxWidth: '660px' }}>
            {/* Action + confidence */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
              <span style={{
                fontFamily: FONT_MONO,
                fontSize: '0.6rem',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#e8471c',
              }}>
                {ACTION_LABELS[directive.action_type] ?? directive.action_type}
              </span>
              <span style={{
                fontFamily: FONT_MONO,
                fontSize: '0.6rem',
                letterSpacing: '0.12em',
                color: '#2e2b26',
              }}>
                {directive.confidence}%
              </span>
            </div>

            {/* The directive — the star of the show */}
            <p style={{
              fontFamily: FONT_SERIF,
              fontSize: 'clamp(1.85rem, 4.5vw, 2.85rem)',
              lineHeight: 1.2,
              letterSpacing: '-0.015em',
              marginBottom: '2rem',
              fontWeight: 400,
            }}>
              {directive.directive}
            </p>

            {/* Reason */}
            <p style={{
              fontSize: '0.975rem',
              lineHeight: 1.75,
              color: '#7a7168',
              marginBottom: '3.5rem',
              maxWidth: '540px',
            }}>
              {directive.reason}
            </p>

            {/* Separator */}
            <div style={{ width: '2rem', height: '1px', background: '#1a1917', marginBottom: '2.5rem' }} />

            {/* Email capture — the conversion moment */}
            {saved ? (
              <div>
                <p style={{ fontFamily: FONT_MONO, fontSize: '0.65rem', letterSpacing: '0.12em', color: '#58534e', marginBottom: '0.75rem' }}>
                  ✓ saved
                </p>
                <a
                  href="/api/auth/signin"
                  style={{ fontFamily: FONT_SERIF, fontSize: '1.1rem', color: '#a09890', fontStyle: 'italic', textDecoration: 'none', borderBottom: '1px solid #2e2b26' }}
                >
                  Sign in to unlock the full dashboard →
                </a>
              </div>
            ) : (
              <div>
                <p style={{
                  fontFamily: FONT_SERIF,
                  fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)',
                  color: '#a09890',
                  marginBottom: '1.25rem',
                  fontStyle: 'italic',
                  fontWeight: 400,
                }}>
                  Save this and get tomorrow&rsquo;s directive →
                </p>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                  <input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    placeholder="you@example.com"
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid #1e1c18',
                      outline: 'none',
                      color: '#f0ece4',
                      fontSize: '1rem',
                      fontFamily: FONT_SANS,
                      padding: '0.5rem 0',
                      caretColor: '#e8471c',
                    }}
                  />
                  <button
                    onClick={handleSave}
                    style={{
                      ...ghostBtn,
                      color: email.includes('@') ? '#f0ece4' : '#2e2b26',
                      paddingBottom: '0.5rem',
                      fontSize: '0.65rem',
                    }}
                  >
                    →
                  </button>
                </div>
                {error && (
                  <p style={{ marginTop: '0.75rem', color: '#e8471c', fontFamily: FONT_MONO, fontSize: '0.65rem', letterSpacing: '0.08em' }}>
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── QuestionScreen ───────────────────────────────────────────────────────────

interface QProps {
  style: React.CSSProperties;
  num: string;
  total: string;
  question: string;
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onNext: () => void;
  isLast?: boolean;
  error?: string;
  inputBase: React.CSSProperties;
  ghostBtn: React.CSSProperties;
  FONT_SERIF: string;
  FONT_MONO: string;
}

function QuestionScreen({ style, num, total, question, value, onChange, inputRef, onNext, isLast, error, inputBase, ghostBtn, FONT_SERIF, FONT_MONO }: QProps) {
  const lines = question.split('\n');
  const ready = value.trim().length > 0;

  return (
    <div style={{ ...style, width: '100%', maxWidth: '660px' }}>
      {/* Counter */}
      <p style={{ fontFamily: FONT_MONO, fontSize: '0.6rem', letterSpacing: '0.2em', color: '#2e2b26', marginBottom: '3rem' }}>
        {num} / {total}
      </p>

      {/* Question */}
      <h2 style={{
        fontFamily: FONT_SERIF,
        fontSize: 'clamp(2rem, 5.5vw, 3.5rem)',
        lineHeight: 1.12,
        letterSpacing: '-0.02em',
        marginBottom: '3rem',
        fontWeight: 400,
      }}>
        {lines.map((line, i) => (
          <span key={i}>{line}{i < lines.length - 1 && <br />}</span>
        ))}
      </h2>

      {/* Input */}
      <textarea
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (ready) onNext(); }
        }}
        placeholder="Answer here..."
        rows={3}
        style={{ ...inputBase, display: 'block', marginBottom: '2.5rem' }}
      />

      {/* Error */}
      {error && (
        <p style={{ marginBottom: '1rem', color: '#e8471c', fontFamily: FONT_MONO, fontSize: '0.65rem', letterSpacing: '0.08em' }}>
          {error}
        </p>
      )}

      {/* Next */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onNext}
          style={{
            ...ghostBtn,
            color: ready ? '#f0ece4' : '#2e2b26',
            fontSize: isLast ? '0.7rem' : '1.25rem',
            letterSpacing: isLast ? '0.12em' : '0',
          }}
        >
          {isLast ? 'Generate my directive →' : '→'}
        </button>
      </div>
    </div>
  );
}
