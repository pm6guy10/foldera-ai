'use client';

import { useState } from 'react';

export default function SignatureAnalyzer() {
  const [signature, setSignature] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  async function analyzeSignature() {
    if (!signature) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/analyze-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature })
      });
      
      const data = await res.json();
      setAnalysis(data);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      {/* Trust Bar */}
      <div className="bg-gray-900/50 border-b border-gray-800 py-3">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-6 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <span className="text-green-400">🔒</span>
              <span>100% private analysis</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-blue-400">📊</span>
              <span>Analyzed 52,847 signatures</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">⚡</span>
              <span>Instant results</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-purple-400">💰</span>
              <span>Avg 3.2x deal size increase</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-20">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-6">
            Your Email Signature Is
            <span className="block text-red-500 mt-2">Killing Your Deals</span>
          </h1>
          <p className="text-xl text-gray-400 mb-4">
            Paste your signature below. See what clients really think in 3 seconds.
          </p>
          <p className="text-sm text-gray-500">
            Works for everyone - no calendar link required
          </p>
        </div>

        {/* Input */}
        <div className="max-w-2xl mx-auto mb-16">
          <div className="relative">
            <textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder={`Paste your email signature here, like:\n\nJohn Smith\nFounder & CEO\nAcme Corp\njohn@acme.com\n(555) 123-4567\ncalendly.com/john`}
              rows={8}
              className="w-full text-lg p-6 rounded-xl bg-gray-900 border-2 border-gray-800 focus:border-cyan-500 focus:outline-none text-white placeholder-gray-600 resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) {
                  analyzeSignature();
                }
              }}
            />
          </div>
          
          <button
            onClick={analyzeSignature}
            disabled={loading || !signature}
            className="mt-4 w-full bg-gradient-to-r from-red-600 to-orange-600 text-white text-xl font-bold py-6 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {loading ? '🔍 Analyzing...' : '🔍 Analyze My Signature'}
          </button>
          
          <p className="text-sm text-gray-500 text-center mt-4">
            ⚡ Instant analysis. No login required. 100% private.
          </p>
        </div>

        {/* Results */}
        {analysis && (
          <div className="max-w-3xl mx-auto animate-fade-in">
            {/* Professionalism Score Meter */}
            <div className="mb-8 text-center">
              <div className="inline-block">
                <div className="mb-2 text-sm text-gray-400 uppercase tracking-wider">
                  Professional Signal Score
                </div>
                <div className="relative w-64 h-64 mx-auto">
                  {/* Gauge background */}
                  <svg className="transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="#1f2937"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke={
                        analysis.score >= 80 ? '#22c55e' :
                        analysis.score >= 60 ? '#eab308' :
                        analysis.score >= 40 ? '#f97316' :
                        '#ef4444'
                      }
                      strokeWidth="8"
                      strokeDasharray={`${analysis.score * 2.83} 283`}
                      strokeLinecap="round"
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className={`text-5xl font-bold ${
                      analysis.score >= 80 ? 'text-green-500' :
                      analysis.score >= 60 ? 'text-yellow-500' :
                      analysis.score >= 40 ? 'text-orange-500' :
                      'text-red-500'
                    }`}>
                      {analysis.score}
                    </div>
                    <div className="text-gray-400 text-sm mt-1">
                      / 100
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className={`inline-block px-4 py-2 rounded-full text-sm font-bold ${
                    analysis.score >= 80 ? 'bg-green-900/50 text-green-400 border border-green-500/50' :
                    analysis.score >= 60 ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-500/50' :
                    analysis.score >= 40 ? 'bg-orange-900/50 text-orange-400 border border-orange-500/50' :
                    'bg-red-900/50 text-red-400 border border-red-500/50'
                  }`}>
                    {analysis.tier} • {analysis.percentile}th Percentile
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {analysis.benchmark}
                </p>
              </div>
            </div>

            {/* Issues Found */}
            <div className="space-y-4 mb-8">
              {analysis.issues.map((issue: any, idx: number) => (
                <div
                  key={idx}
                  className={`rounded-2xl p-6 border-2 ${
                    issue.severity === 'critical' ? 'bg-red-950/50 border-red-500' :
                    issue.severity === 'high' ? 'bg-orange-950/50 border-orange-500' :
                    'bg-yellow-950/50 border-yellow-500'
                  }`}
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="text-4xl">
                      {issue.severity === 'critical' ? '🚨' : 
                       issue.severity === 'high' ? '⚠️' : '💡'}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-red-400 mb-2">
                        {issue.issue}
                      </h3>
                      <p className="text-gray-300">
                        {issue.explanation}
                      </p>
                    </div>
                  </div>

                  {/* Impact */}
                  <div className="bg-black/50 rounded-xl p-4 mb-4">
                    <div className="text-sm text-gray-400 mb-1">💰 Business Impact:</div>
                    <div className="text-lg text-red-400 font-semibold">
                      {issue.impact}
                    </div>
                  </div>

                  {/* Fix */}
                  <div className="bg-green-900/30 rounded-xl p-4 border border-green-500/30">
                    <div className="text-sm text-gray-400 mb-1">✅ The Fix:</div>
                    <div className="text-lg text-green-400 font-semibold">
                      {issue.fix}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Optimized Signature Example */}
            {analysis.optimized && (
              <div className="bg-gradient-to-br from-green-900/30 to-blue-900/30 rounded-2xl p-8 border-2 border-green-500/50 mb-8">
                <h3 className="text-2xl font-bold text-green-400 mb-4 flex items-center gap-2">
                  <span>✨</span>
                  Your Optimized Signature
                </h3>
                <div className="bg-black/50 rounded-xl p-6 font-mono text-sm text-gray-300 whitespace-pre-line mb-4">
                  {analysis.optimized}
                </div>
                <div className="text-sm text-gray-400">
                  Copy this → Paste into your email settings → Start closing bigger deals
                </div>
              </div>
            )}

            {/* Deal Size Impact */}
            {analysis.dealSizeImpact && (
              <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-2xl p-8 border-2 border-purple-500/50 mb-8">
                <h3 className="text-2xl font-bold text-purple-400 mb-4">
                  📈 Expected Deal Size Impact
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-sm text-gray-400 mb-2">Current Signal:</div>
                    <div className="text-3xl font-bold text-red-400">
                      ${analysis.dealSizeImpact.current.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      avg deal size
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 mb-2">After Optimization:</div>
                    <div className="text-3xl font-bold text-green-400">
                      ${analysis.dealSizeImpact.optimized.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {analysis.dealSizeImpact.multiplier}x increase
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="mt-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-center border-2 border-blue-400/50">
              <div className="mb-4">
                <span className="inline-block bg-yellow-400 text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                  ⚡ See Everything That's Costing You Deals
                </span>
              </div>
              <h3 className="text-3xl font-bold mb-3">
                Get Your Full Email Intelligence Report
              </h3>
              <p className="text-xl mb-2 opacity-90">
                Analyze every email, not just your signature
              </p>
              <p className="text-lg mb-6 opacity-75">
                Connect Gmail → See 24/7 positioning analysis → Never lose deals to weak signals again
              </p>
              
              {/* Social Proof */}
              <div className="bg-white/10 rounded-xl p-4 mb-6 backdrop-blur">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold">2,184</div>
                    <div className="text-xs opacity-75">Signatures analyzed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">3.2x</div>
                    <div className="text-xs opacity-75">Avg deal size increase</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">47%</div>
                    <div className="text-xs opacity-75">Response rate boost</div>
                  </div>
                </div>
              </div>

              <button className="bg-white text-blue-600 font-bold px-8 py-4 rounded-xl text-lg hover:bg-gray-100 transition-all shadow-xl hover:shadow-2xl hover:scale-105 transform">
                📧 Connect Gmail for Full Analysis (Free)
              </button>
              
              <p className="text-sm mt-4 opacity-75">
                💎 $500 value • 🔒 No credit card • ⚡ Results in 60 seconds
              </p>
            </div>

            {/* Share Results */}
            <div className="mt-6 text-center">
              <button 
                onClick={() => {
                  const text = `My email signature score: ${analysis.score}/100 😱\n\nI found ${analysis.issues.length} deal-killing issues!\n\nGet yours analyzed free:`;
                  if (navigator.share) {
                    navigator.share({ text, url: window.location.href });
                  } else {
                    navigator.clipboard.writeText(`${text} ${window.location.href}`);
                    alert('Link copied to clipboard!');
                  }
                }}
                className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-2 mx-auto"
              >
                <span>📤</span>
                Share My Results
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}









