'use client';
import { useState, useEffect } from 'react';
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

  // Check if we just returned from OAuth with results
  useEffect(() => {
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
  }, []);

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
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white leading-tight">
              {result.headline}
            </h2>

            {/* Evidence: side-by-side cards with source labels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border border-white/10 rounded-lg p-6 bg-black/40">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  {result.evidenceA.source}
                </div>
                <blockquote className="text-gray-300 text-sm leading-relaxed border-l-2 border-white/20 pl-4">
                  {result.evidenceA.snippet}
                </blockquote>
              </div>
              <div className="border border-white/10 rounded-lg p-6 bg-black/40">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  {result.evidenceB.source}
                </div>
                <blockquote className="text-gray-300 text-sm leading-relaxed border-l-2 border-white/20 pl-4">
                  {result.evidenceB.snippet}
                </blockquote>
              </div>
            </div>

            {/* Drafted solution: distinct box with copy button */}
            <div className="border border-white/10 rounded-lg p-6 bg-white/[0.02]">
              <div className="flex items-center justify-between gap-4 mb-3">
                <span className="text-sm font-medium text-gray-400">Drafted solution</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(result.draftedSolution);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-white/10 border border-white/10 rounded-md hover:bg-white/15 transition-colors"
                >
                  Copy
                </button>
              </div>
              <p className="text-white leading-relaxed">{result.draftedSolution}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
