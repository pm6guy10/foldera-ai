'use client';

import { useState, useEffect } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────

const FONT_SERIF = '"Instrument Serif", Georgia, "Times New Roman", serif';
const FONT_MONO  = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';

const GENERATION_MSGS = [
  'Finding your patterns...',
  'Reading between the lines...',
  'Almost there...',
];

const DIRECTIVE = {
  text:        "You already know what to do. You're stalling because doing it makes it real.",
  action_type: 'DECIDE',
  confidence:  91,
  reason:      'Every person who lands here is avoiding one specific thing. This is it.',
};

const GENERATE_DELAY_MS = 3200;
const MSG_INTERVAL_MS   = 1350;

// ─── Page ─────────────────────────────────────────────────────────────────────

type Phase = 'generating' | 'directive';

export default function OnboardPage() {
  const [phase, setPhase]       = useState<Phase>('generating');
  const [visible, setVisible]   = useState(false);
  const [msgIdx, setMsgIdx]     = useState(0);

  // Fade in on mount and on phase change
  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 40);
    return () => clearTimeout(t);
  }, [phase]);

  // Cycle messages and auto-advance while generating
  useEffect(() => {
    if (phase !== 'generating') return;
    setMsgIdx(0);
    const cycle   = setInterval(() => setMsgIdx(i => (i + 1) % GENERATION_MSGS.length), MSG_INTERVAL_MS);
    const advance = setTimeout(() => setPhase('directive'), GENERATE_DELAY_MS);
    return () => { clearInterval(cycle); clearTimeout(advance); };
  }, [phase]);

  const fade: React.CSSProperties = {
    opacity:    visible ? 1 : 0,
    transform:  visible ? 'translateY(0)' : 'translateY(16px)',
    transition: 'opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)',
  };

  return (
    <main style={{
      minHeight:      '100vh',
      background:     '#080808',
      color:          '#f0ece4',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '2rem 1.5rem',
      position:       'relative',
    }}>
      {/* Logo */}
      <a href="/" style={{
        position:   'absolute',
        top:        '2rem',
        left:       '2.5rem',
        fontFamily: FONT_SERIF,
        fontSize:   '1.1rem',
        color:      '#f0ece4',
        opacity:    0.4,
        textDecoration: 'none',
        transition: 'opacity 0.2s',
      }}>
        Foldera
      </a>

      {/* ── GENERATING ──────────────────────────────────────────────────────── */}
      {phase === 'generating' && (
        <p style={{
          ...fade,
          fontFamily:  FONT_SERIF,
          fontSize:    'clamp(1.25rem, 3.5vw, 1.75rem)',
          color:       '#58534e',
          fontStyle:   'italic',
          fontWeight:  400,
          letterSpacing: '0.01em',
        }}>
          {GENERATION_MSGS[msgIdx]}
        </p>
      )}

      {/* ── DIRECTIVE ───────────────────────────────────────────────────────── */}
      {phase === 'directive' && (
        <div style={{ ...fade, width: '100%', maxWidth: '660px' }}>
          {/* Action type + confidence */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
            <span style={{
              fontFamily:    FONT_MONO,
              fontSize:      '0.6rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color:         '#e8471c',
            }}>
              {DIRECTIVE.action_type}
            </span>
            <span style={{
              fontFamily:    FONT_MONO,
              fontSize:      '0.6rem',
              letterSpacing: '0.12em',
              color:         '#2e2b26',
            }}>
              {DIRECTIVE.confidence}%
            </span>
          </div>

          {/* The directive */}
          <p style={{
            fontFamily:    FONT_SERIF,
            fontSize:      'clamp(1.85rem, 4.5vw, 2.85rem)',
            lineHeight:    1.2,
            letterSpacing: '-0.015em',
            marginBottom:  '2rem',
            fontWeight:    400,
          }}>
            {DIRECTIVE.text}
          </p>

          {/* Reason */}
          <p style={{
            fontSize:   '0.975rem',
            lineHeight: 1.75,
            color:      '#7a7168',
            maxWidth:   '540px',
          }}>
            {DIRECTIVE.reason}
          </p>
        </div>
      )}
    </main>
  );
}
