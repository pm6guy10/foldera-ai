'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface AuditResult {
  headline: string;
  evidenceA: { source: string; snippet: string };
  evidenceB: { source: string; snippet: string };
  draftedSolution: string;
}

export default function InstantAuditPage() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState('');

  const handleConnectAndAudit = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Step 1: Initiate Google OAuth
      setProgress('Connecting to Google...');
      
      // Get Google Auth URL
      const authResponse = await fetch('/api/auth/google/instant-audit');
      const { url } = await authResponse.json();
      
      if (url) {
        // Redirect to Google OAuth
        window.location.href = url;
      } else {
        throw new Error('Failed to get Google auth URL');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start audit');
      setLoading(false);
    }
  };

  const handleUnlockSolution = async () => {
    try {
      // Create Stripe checkout session
      const response = await fetch('/api/checkout/instant-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const { url } = await response.json();
      
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Failed to start checkout. Please try again.');
    }
  };

  // Check if we just returned from OAuth with results
  useState(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const auditData = params.get('audit');
    
    if (auditData) {
      try {
        const decoded = JSON.parse(decodeURIComponent(auditData));
        setResult(decoded);
      } catch (e) {
        console.error('Failed to parse audit data:', e);
      }
    }
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navigation */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Link href="/" className="flex items-center space-x-3">
            <Image src="/foldera-glyph.svg" alt="Foldera" width={32} height={32} />
            <span className="font-semibold text-xl">Foldera</span>
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16">
        {!loading && !result && (
          <div className="text-center">
            <div className="mb-8">
              <div className="text-6xl mb-6">🚨</div>
              <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent">
                Instant Audit
              </h1>
              <p className="text-xl text-slate-300 mb-8">
                Find your ONE career-threatening conflict in under 60 seconds
              </p>
            </div>

            <button
              onClick={handleConnectAndAudit}
              className="px-12 py-6 bg-gradient-to-r from-red-600 to-orange-600 text-white text-xl font-bold rounded-2xl hover:shadow-2xl hover:shadow-red-500/50 transform hover:scale-105 transition-all mb-8"
            >
              Connect Google & Run Instant Audit
            </button>

            <div className="max-w-2xl mx-auto bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <p className="text-sm text-slate-400">
                Foldera will scan your <strong className="text-white">last 7 days</strong> of Gmail + Drive
                to find one career-threatening conflict.
              </p>
              <p className="text-sm text-slate-400 mt-2">
                <strong className="text-green-400">✓ Read-only access</strong> • 
                <strong className="text-green-400 ml-2">✓ Data auto-deleted in 24h</strong> • 
                <strong className="text-green-400 ml-2">✓ No credit card required</strong>
              </p>
            </div>

            {error && (
              <div className="mt-4 bg-red-900/20 border border-red-500 rounded-lg p-4 text-red-300">
                {error}
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="text-center">
            <div className="mb-8">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-500 mx-auto mb-6"></div>
              <h2 className="text-3xl font-bold mb-4">{progress}</h2>
              <div className="space-y-2 text-slate-400">
                <p className="animate-pulse">🔍 Scanning financials...</p>
                <p className="animate-pulse delay-100">📊 Analyzing commitments...</p>
                <p className="animate-pulse delay-200">⚠️ Cross-referencing deadlines...</p>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-8">
            {/* Headline */}
            <div className="bg-red-900/20 border-2 border-red-500 rounded-2xl p-8 text-center">
              <div className="text-6xl mb-4">🚨</div>
              <h2 className="text-3xl font-bold text-red-400 mb-4">
                {result.headline}
              </h2>
            </div>

            {/* Evidence */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-800/50 border border-yellow-500/50 rounded-lg p-6">
                <h3 className="font-semibold text-yellow-400 mb-3 flex items-center">
                  <span className="mr-2">📄</span>
                  Evidence A
                </h3>
                <div className="text-sm text-slate-400 mb-2">{result.evidenceA.source}</div>
                <blockquote className="text-slate-200 italic border-l-2 border-yellow-500 pl-4">
                  "{result.evidenceA.snippet}"
                </blockquote>
              </div>

              <div className="bg-slate-800/50 border border-yellow-500/50 rounded-lg p-6">
                <h3 className="font-semibold text-yellow-400 mb-3 flex items-center">
                  <span className="mr-2">📄</span>
                  Evidence B
                </h3>
                <div className="text-sm text-slate-400 mb-2">{result.evidenceB.source}</div>
                <blockquote className="text-slate-200 italic border-l-2 border-yellow-500 pl-4">
                  "{result.evidenceB.snippet}"
                </blockquote>
              </div>
            </div>

            {/* Blurred Solution */}
            <div className="relative bg-slate-800/50 border border-green-500/50 rounded-lg p-6">
              <h3 className="font-semibold text-green-400 mb-4">
                ✅ Drafted Solution
              </h3>
              <div className="relative">
                <div className="text-slate-300 blur-sm select-none">
                  {result.draftedSolution}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    onClick={handleUnlockSolution}
                    className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg font-bold rounded-xl hover:shadow-2xl hover:shadow-green-500/50 transform hover:scale-105 transition-all"
                  >
                    Unlock Solution & Activate 24/7 Guardian
                    <div className="text-sm font-normal mt-1">$49/month</div>
                  </button>
                </div>
              </div>
            </div>

            {/* What You Get */}
            <div className="bg-slate-900/50 rounded-lg p-8 border border-slate-700">
              <h3 className="text-2xl font-bold text-white mb-6">
                What You Get with 24/7 Guardian
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start space-x-3">
                  <span className="text-green-400 mt-1">✓</span>
                  <span className="text-slate-300">Continuous monitoring of all Gmail + Drive</span>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="text-green-400 mt-1">✓</span>
                  <span className="text-slate-300">Instant alerts when conflicts detected</span>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="text-green-400 mt-1">✓</span>
                  <span className="text-slate-300">Pre-drafted solutions ready to send</span>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="text-green-400 mt-1">✓</span>
                  <span className="text-slate-300">Morning briefings with top priorities</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
