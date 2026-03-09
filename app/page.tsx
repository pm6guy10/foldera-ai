'use client';

import { useEffect, useState } from 'react';

const css = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@300;400&family=Bricolage+Grotesque:wght@300;400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --ink: #0d0d0d; --paper: #f5f2ec; --paper-dark: #ede9e1;
  --accent: #c8421a; --accent-muted: #e8c4b4;
  --text: #1a1a1a; --muted: #7a7268; --border: #d4cfc6;
  --serif: 'Instrument Serif', Georgia, serif;
  --mono: 'DM Mono', monospace;
  --sans: 'Bricolage Grotesque', sans-serif;
}
html { scroll-behavior: smooth; }
body {
  background: var(--paper) !important;
  color: var(--text);
  font-family: var(--sans) !important;
  font-weight: 300;
  line-height: 1.6;
  overflow-x: hidden;
}
nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.25rem 3rem;
  background: rgba(245,242,236,0.94); backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}
.nav-logo { font-family: var(--serif); font-size: 1.35rem; color: var(--ink); text-decoration: none; }
.nav-right { display: flex; align-items: center; gap: 2rem; }
.nav-link { font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); text-decoration: none; transition: color 0.2s; }
.nav-link:hover { color: var(--ink); }
.btn-nav { font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--paper); background: var(--ink); padding: 0.6rem 1.4rem; text-decoration: none; transition: background 0.2s; }
.btn-nav:hover { background: var(--accent); }
.hero { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 9rem 3rem 6rem; position: relative; overflow: hidden; }
.hero::after { content: ''; position: absolute; top: 0; right: 0; width: 50vw; height: 100%; background: linear-gradient(135deg, transparent 40%, rgba(200,66,26,0.04) 100%); pointer-events: none; }
.hero-kicker { font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin-bottom: 2.25rem; opacity: 0; animation: up 0.7s ease forwards 0.1s; }
.hero-h1 { font-family: var(--serif); font-size: clamp(3rem, 6.5vw, 6rem); line-height: 1.05; letter-spacing: -0.025em; color: var(--ink); max-width: 840px; opacity: 0; animation: up 0.8s ease forwards 0.2s; }
.hero-h1 em { font-style: italic; color: var(--accent); }
.hero-sub { margin-top: 2.5rem; font-size: 1.1rem; color: var(--muted); max-width: 500px; line-height: 1.75; font-weight: 300; opacity: 0; animation: up 0.8s ease forwards 0.38s; }
.hero-actions { margin-top: 3rem; display: flex; align-items: center; gap: 2rem; flex-wrap: wrap; opacity: 0; animation: up 0.8s ease forwards 0.52s; }
.btn-hero { font-family: var(--mono); font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--paper); background: var(--ink); padding: 0.85rem 2rem; text-decoration: none; transition: background 0.2s, transform 0.15s; display: inline-block; border: none; cursor: pointer; }
.btn-hero:hover { background: var(--accent); transform: translateY(-1px); }
.hero-trust { font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.06em; color: var(--muted); }
.hero-patterns { margin-top: 3.5rem; opacity: 0; animation: up 0.8s ease forwards 0.68s; }
.hero-patterns-label { font-family: var(--mono); font-size: 0.58rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.85rem; }
.hero-pattern-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
.hero-pattern-item { display: flex; align-items: baseline; gap: 0.85rem; font-size: 0.9rem; color: var(--text); line-height: 1.5; }
.hero-pattern-item::before { content: '→'; font-family: var(--mono); font-size: 0.65rem; color: var(--accent); flex-shrink: 0; }
.hero-divider { position: absolute; bottom: 0; left: 0; right: 0; height: 1px; background: var(--border); }
.realization { padding: 7rem 3rem; background: var(--paper); border-top: 1px solid var(--border); }
.real-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 8rem; align-items: center; }
.real-left h2 { font-family: var(--serif); font-size: clamp(2rem, 3.5vw, 3.25rem); line-height: 1.1; letter-spacing: -0.02em; color: var(--ink); margin-bottom: 2rem; }
.real-left h2 em { font-style: italic; color: var(--accent); }
.real-left p { font-size: 1rem; color: var(--muted); line-height: 1.85; margin-bottom: 1.25rem; }
.signal-list { list-style: none; border: 1px solid var(--border); }
.signal-item { padding: 1.35rem 1.75rem; border-bottom: 1px solid var(--border); display: flex; gap: 1.25rem; align-items: flex-start; }
.signal-item:last-child { border-bottom: none; }
.signal-dot { width: 6px; height: 6px; background: var(--accent); border-radius: 50%; flex-shrink: 0; margin-top: 0.55rem; }
.signal-text { font-size: 0.9rem; color: var(--text); line-height: 1.6; }
.signal-source { font-family: var(--mono); font-size: 0.55rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-top: 0.3rem; display: block; }
.brief-wrap { background: var(--ink); padding: 7rem 3rem; position: relative; }
.brief-wrap::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(200,66,26,0.45), transparent); }
.brief-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1.15fr; gap: 6rem; align-items: center; }
.brief-copy-kicker { font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 1.5rem; }
.brief-copy-h2 { font-family: var(--serif); font-size: clamp(2rem, 3.5vw, 3rem); line-height: 1.12; color: var(--paper); letter-spacing: -0.02em; margin-bottom: 1.75rem; }
.brief-copy-h2 em { font-style: italic; color: var(--accent-muted); }
.brief-copy-p { font-size: 0.95rem; color: #8a8279; line-height: 1.85; }
.brief-card { background: #141210; border: 1px solid #252220; position: relative; padding: 2rem 2.25rem 2.25rem; }
.brief-card::before { content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: var(--accent); }
.bc-date { font-family: var(--mono); font-size: 0.58rem; letter-spacing: 0.1em; text-transform: uppercase; color: #3a3630; margin-bottom: 1.75rem; }
.bc-label { font-family: var(--mono); font-size: 0.54rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 0.5rem; }
.bc-insight { font-family: var(--serif); font-size: 1.2rem; line-height: 1.5; color: #f0ece4; font-style: italic; margin-bottom: 1.5rem; }
.bc-conf { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; }
.bc-conf-label { font-family: var(--mono); font-size: 0.54rem; letter-spacing: 0.1em; text-transform: uppercase; color: #3a3630; }
.bc-conf-track { flex: 1; height: 2px; background: #252220; position: relative; }
.bc-conf-fill { position: absolute; left: 0; top: 0; height: 100%; background: var(--accent); width: 78%; }
.bc-conf-val { font-family: var(--mono); font-size: 0.58rem; color: var(--accent); }
.bc-divider { border: none; border-top: 1px solid #252220; margin: 1.25rem 0; }
.bc-action { font-size: 0.88rem; color: #b8b4ac; line-height: 1.65; }
.bc-basis { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid #252220; font-family: var(--mono); font-size: 0.58rem; letter-spacing: 0.06em; color: #3a3630; line-height: 1.6; }
.pattern-section { padding: 7rem 3rem; background: var(--paper-dark); border-top: 1px solid var(--border); }
.pattern-inner { max-width: 1100px; margin: 0 auto; }
.pattern-kicker { font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 1.25rem; }
.pattern-h2 { font-family: var(--serif); font-size: clamp(2rem, 3.5vw, 3rem); line-height: 1.12; letter-spacing: -0.02em; color: var(--ink); max-width: 580px; margin-bottom: 1rem; }
.pattern-h2 em { font-style: italic; color: var(--accent); }
.pattern-sub { font-size: 0.95rem; color: var(--muted); max-width: 480px; line-height: 1.75; margin-bottom: 3.5rem; }
.pattern-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); }
.pattern-card { background: var(--paper-dark); padding: 2rem 2.25rem; transition: background 0.2s; position: relative; overflow: hidden; }
.pattern-card:hover { background: var(--paper); }
.pattern-card::before { content: ''; position: absolute; top: 0; left: 0; height: 3px; width: 0; background: var(--accent); transition: width 0.35s ease; }
.pattern-card:hover::before { width: 100%; }
.pc-label { font-family: var(--mono); font-size: 0.55rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 0.75rem; opacity: 0.75; }
.pc-observation { font-family: var(--serif); font-size: 1.1rem; color: var(--ink); line-height: 1.4; margin-bottom: 0.75rem; }
.pc-detail { font-size: 0.825rem; color: var(--muted); line-height: 1.65; }
.how-section { padding: 7rem 3rem; background: var(--paper); border-top: 1px solid var(--border); }
.how-inner { max-width: 1100px; margin: 0 auto; }
.how-kicker { font-family: var(--mono); font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 1.25rem; }
.how-h2 { font-family: var(--serif); font-size: clamp(2rem, 3.5vw, 3rem); line-height: 1.12; letter-spacing: -0.02em; color: var(--ink); max-width: 540px; margin-bottom: 4rem; }
.how-h2 em { font-style: italic; color: var(--accent); }
.steps { display: grid; grid-template-columns: repeat(3,1fr); border: 1px solid var(--border); }
.step { padding: 2.5rem 2rem; border-right: 1px solid var(--border); position: relative; overflow: hidden; }
.step:last-child { border-right: none; }
.step::after { content: ''; position: absolute; top: 0; left: 0; height: 3px; width: 0; background: var(--accent); transition: width 0.35s ease; }
.step:hover::after { width: 100%; }
.step-n { font-family: var(--mono); font-size: 0.58rem; letter-spacing: 0.12em; color: var(--accent); margin-bottom: 1.25rem; display: block; }
.step-title { font-family: var(--serif); font-size: 1.3rem; color: var(--ink); margin-bottom: 0.85rem; line-height: 1.2; }
.step-body { font-size: 0.875rem; color: var(--muted); line-height: 1.75; }
.cta-section { padding: 9rem 3rem; background: var(--ink); text-align: center; position: relative; overflow: hidden; }
.cta-section::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(200,66,26,0.4), transparent); }
.cta-section::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 700px; height: 700px; background: radial-gradient(ellipse, rgba(200,66,26,0.06) 0%, transparent 65%); pointer-events: none; }
.cta-inner { position: relative; z-index: 1; }
.cta-h2 { font-family: var(--serif); font-size: clamp(2.5rem, 5.5vw, 5rem); line-height: 1.05; letter-spacing: -0.025em; color: var(--paper); margin-bottom: 1.5rem; }
.cta-h2 em { font-style: italic; color: var(--accent-muted); }
.cta-sub { font-size: 1rem; color: #7a7268; margin: 0 auto 3rem; max-width: 400px; line-height: 1.75; }
.cta-form { display: flex; max-width: 440px; margin: 0 auto 1.25rem; border: 1px solid #2a2620; }
.cta-input { flex: 1; padding: 0.9rem 1.25rem; background: #161412; border: none; font-family: var(--sans); font-size: 0.875rem; color: var(--paper); outline: none; }
.cta-input::placeholder { color: #4a4640; }
.cta-btn { padding: 0.9rem 1.75rem; background: var(--accent); color: var(--paper); font-family: var(--mono); font-size: 0.65rem; letter-spacing: 0.1em; text-transform: uppercase; border: none; cursor: pointer; transition: background 0.2s; white-space: nowrap; }
.cta-btn:hover { background: #a83515; }
.cta-btn:disabled { cursor: default; }
.cta-fine { font-family: var(--mono); font-size: 0.58rem; letter-spacing: 0.08em; color: #3a3630; }
footer { padding: 1.75rem 3rem; border-top: 1px solid #1e1c1a; background: var(--ink); display: flex; align-items: center; justify-content: space-between; }
.footer-logo { font-family: var(--serif); font-size: 1.05rem; color: #4a4640; text-decoration: none; }
.footer-copy { font-family: var(--mono); font-size: 0.58rem; letter-spacing: 0.06em; color: #3a3630; }
.footer-links { display: flex; gap: 1.5rem; }
.footer-link { font-family: var(--mono); font-size: 0.58rem; letter-spacing: 0.08em; text-transform: uppercase; color: #3a3630; text-decoration: none; transition: color 0.2s; }
.footer-link:hover { color: #7a7268; }
@keyframes up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
.reveal { opacity: 0; transform: translateY(22px); transition: opacity 0.65s ease, transform 0.65s ease; }
.reveal.in { opacity: 1; transform: translateY(0); }
@media (max-width: 900px) {
  nav { padding: 1rem 1.5rem; }
  .nav-link { display: none; }
  .hero, .realization, .brief-wrap, .pattern-section, .how-section { padding: 5rem 1.5rem; }
  .cta-section { padding: 6rem 1.5rem; }
  .real-inner, .brief-inner { grid-template-columns: 1fr; gap: 3rem; }
  .pattern-grid { grid-template-columns: 1fr; }
  .steps { grid-template-columns: 1fr; }
  .step { border-right: none; border-bottom: 1px solid var(--border); }
  .step:last-child { border-bottom: none; }
  .cta-form { flex-direction: column; }
  footer { flex-direction: column; gap: 1rem; text-align: center; padding: 1.5rem; }
}
`;

export default function HomePage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [inputError, setInputError] = useState(false);

  useEffect(() => {
    const reveals = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e, i) => {
          if (e.isIntersecting) {
            setTimeout(() => e.target.classList.add('in'), i * 70);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    reveals.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  function handleSubmit() {
    if (!email.trim() || !email.includes('@')) {
      setInputError(true);
      return;
    }
    setSubmitted(true);
    setInputError(false);
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <nav>
        <a href="#" className="nav-logo">Foldera</a>
        <div className="nav-right">
          <a href="#how" className="nav-link">How it works</a>
          <a href="#access" className="btn-nav">Get early access</a>
        </div>
      </nav>

      <section className="hero">
        <p className="hero-kicker">Private early access</p>
        <h1 className="hero-h1">
          Your past decisions<br />
          already contain<br />
          <em>the pattern.</em>
        </h1>
        <p className="hero-sub">
          Foldera reads your AI conversation history, builds a weighted model of how you actually make decisions, and delivers a daily brief — before you ask.
        </p>
        <div className="hero-actions">
          <a href="#access" className="btn-hero">Reveal my decision patterns</a>
          <span className="hero-trust">No credit card &nbsp;·&nbsp; Connect your Claude history in 60 seconds</span>
        </div>
        <div className="hero-patterns">
          <p className="hero-patterns-label">Foldera might notice things like</p>
          <ul className="hero-pattern-list">
            <li className="hero-pattern-item">You explored leaving your role in Oct, Jan, and Feb. All three resolved without action.</li>
            <li className="hero-pattern-item">You research alternatives when you should wait. It activates under uncertainty.</li>
            <li className="hero-pattern-item">Waiting resolved 3 of your last 4 high-stakes situations favorably.</li>
          </ul>
        </div>
        <div className="hero-divider"></div>
      </section>

      <section className="realization">
        <div className="real-inner">
          <div className="real-left reveal">
            <h2>Your decisions<br />leave a <em>trail.</em></h2>
            <p>Every conversation where you worked through a hard call. Every moment you asked yourself what to do next. Every time you committed to something and either followed through or didn&apos;t.</p>
            <p>You&apos;ve already generated thousands of data points about how you operate. They&apos;re scattered across history you&apos;ve never been able to reason with.</p>
            <p>Until now.</p>
          </div>
          <ul className="signal-list reveal">
            <li className="signal-item">
              <div className="signal-dot"></div>
              <div>
                <p className="signal-text">Explored leaving the job. Second time in 14 months. Pattern: exits before credit accrues.</p>
                <span className="signal-source">Claude conversation · Feb 18</span>
              </div>
            </li>
            <li className="signal-item">
              <div className="signal-dot"></div>
              <div>
                <p className="signal-text">Committed to waiting on the decision. Outcome pending.</p>
                <span className="signal-source">Logged decision · Mar 4</span>
              </div>
            </li>
            <li className="signal-item">
              <div className="signal-dot"></div>
              <div>
                <p className="signal-text">Same-day reference request received. Positive signal. Decision window open.</p>
                <span className="signal-source">Extracted signal · Mar 4</span>
              </div>
            </li>
            <li className="signal-item">
              <div className="signal-dot"></div>
              <div>
                <p className="signal-text">Anxiety spike detected. Started browsing alternate roles. Pattern: pivot impulse under uncertainty.</p>
                <span className="signal-source">Claude conversation · Mar 7</span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section className="brief-wrap">
        <div className="brief-inner">
          <div className="reveal">
            <p className="brief-copy-kicker">Morning brief</p>
            <h2 className="brief-copy-h2">Not a summary.<br /><em>A verdict.</em></h2>
            <p className="brief-copy-p">Foldera runs your current situation against your behavioral history, calculates the highest-probability action, and delivers a single confident read — with a confidence score traceable to your own data. Not the AI&apos;s opinion. Arithmetic on your own life.</p>
          </div>
          <div className="reveal">
            <div className="brief-card">
              <p className="bc-date">Sunday, March 8 · 6:47 AM</p>
              <p className="bc-label">Top Insight</p>
              <p className="bc-insight">&ldquo;You&apos;re in the same spin pattern that preceded three prior exits. The anxiety is not a signal to act — it&apos;s a signal that you&apos;re in the window before something resolves.&rdquo;</p>
              <div className="bc-conf">
                <span className="bc-conf-label">Confidence</span>
                <div className="bc-conf-track"><div className="bc-conf-fill"></div></div>
                <span className="bc-conf-val">78%</span>
              </div>
              <hr className="bc-divider" />
              <p className="bc-label">Recommended Action</p>
              <p className="bc-action">Stay. The pipeline is full. This is a season of receiving, not building. Every hour spent researching alternatives is a vote of no-confidence in work already done.</p>
              <p className="bc-basis">Based on: 4 similar prior contexts · 3 of 4 resolved favorably through waiting · additional action produced no outcome change in 3 of 4</p>
            </div>
          </div>
        </div>
      </section>

      <section className="pattern-section">
        <div className="pattern-inner">
          <p className="pattern-kicker reveal">What Foldera might notice about you</p>
          <h2 className="pattern-h2 reveal">The moment it<br /><em>reads you.</em></h2>
          <p className="pattern-sub reveal">Three accurate observations in a row. That&apos;s when it stops feeling like software.</p>
          <div className="pattern-grid reveal">
            <div className="pattern-card">
              <p className="pc-label">Decision pattern</p>
              <p className="pc-observation">You leave before credit accrues.</p>
              <p className="pc-detail">Real contribution in every role. Departure before the system recognized the builder. The pattern has a name now — and knowing it is the first step to breaking it.</p>
            </div>
            <div className="pattern-card">
              <p className="pc-label">Behavioral signal</p>
              <p className="pc-observation">You research when you should wait.</p>
              <p className="pc-detail">Browsing under pressure is fear dressed as productivity. Foldera tracks when this pattern activates and flags it before the damage is done.</p>
            </div>
            <div className="pattern-card">
              <p className="pc-label">Historical outcome</p>
              <p className="pc-observation">Waiting has worked more than acting.</p>
              <p className="pc-detail">In three of four high-stakes external decisions, waiting produced the favorable outcome. Additional action changed nothing. That&apos;s not advice — that&apos;s your own record.</p>
            </div>
            <div className="pattern-card">
              <p className="pc-label">Relationship signal</p>
              <p className="pc-observation">You have a warm door you haven&apos;t used.</p>
              <p className="pc-detail">One person left it open twice in writing. The thread has been quiet for 30 days. The window exists. The brief will tell you when the timing is right.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="how-section" id="how">
        <div className="how-inner">
          <p className="how-kicker reveal">How it works</p>
          <h2 className="how-h2 reveal">Two inputs.<br />One model.<br /><em>Everything else is output.</em></h2>
          <div className="steps reveal">
            <div className="step">
              <span className="step-n">01</span>
              <h3 className="step-title">Connect your Claude history</h3>
              <p className="step-body">Your AI conversation history is the richest behavioral dataset that exists about you. Foldera reads it, extracts decisions, patterns, and outcomes, and builds your identity graph. No manual input required.</p>
            </div>
            <div className="step">
              <span className="step-n">02</span>
              <h3 className="step-title">The graph learns</h3>
              <p className="step-body">Decisions, patterns, goals, relationships, outcomes — all weighted by recency and stakes. The model updates with every new signal. Confidence compounds as history accumulates.</p>
            </div>
            <div className="step">
              <span className="step-n">03</span>
              <h3 className="step-title">You get the brief</h3>
              <p className="step-body">Every morning: one insight, one confidence score, one action. Not generic advice. The answer to a question you didn&apos;t know to ask, from data you already lived.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section" id="access">
        <div className="cta-inner">
          <h2 className="cta-h2 reveal">Your life already<br />contains <em>the answers.</em></h2>
          <p className="cta-sub reveal">Foldera simply reveals them. Get early access and receive your first morning brief.</p>
          <div className="cta-form reveal">
            <input
              type="email"
              className="cta-input"
              placeholder="your@email.com"
              aria-label="Email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (inputError) setInputError(false);
              }}
              disabled={submitted}
              style={inputError ? { outline: '2px solid #c8421a' } : {}}
            />
            <button
              className="cta-btn"
              onClick={handleSubmit}
              disabled={submitted}
              style={submitted ? { background: '#1a2e1a', color: '#4a8a4a' } : {}}
            >
              {submitted ? "You're on the list" : 'Reveal my patterns'}
            </button>
          </div>
          <p className="cta-fine reveal">No credit card &nbsp;·&nbsp; No OAuth &nbsp;·&nbsp; Early access only</p>
        </div>
      </section>

      <footer>
        <a href="#" className="footer-logo">Foldera</a>
        <span className="footer-copy">© 2026 Foldera. Your data. Your model. Your move.</span>
        <div className="footer-links">
          <a href="#" className="footer-link">Privacy</a>
          <a href="#" className="footer-link">Terms</a>
          <a href="#" className="footer-link">Contact</a>
        </div>
      </footer>
    </>
  );
}
