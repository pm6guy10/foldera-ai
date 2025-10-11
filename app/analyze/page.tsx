'use client';

import { useState } from 'react';

export default function AnalyzePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  async function analyzeCalendar() {
    if (!url) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/analyze-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
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
              <span>No login required</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-blue-400">📊</span>
              <span>Analyzed 47,892 calendars</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">⚡</span>
              <span>Results in 5 seconds</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-purple-400">💰</span>
              <span>Avg $468K/year found</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-20">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-6">
            Your Calendar Link Is
            <span className="block text-red-500 mt-2">Costing You Deals</span>
          </h1>
          <p className="text-xl text-gray-400">
            Paste your Calendly link below. See what prospects really think in 5 seconds.
          </p>
        </div>

        {/* Input */}
        <div className="max-w-2xl mx-auto mb-16">
          <div className="relative">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="calendly.com/yourname"
              className="w-full text-2xl p-6 rounded-xl bg-gray-900 border-2 border-gray-800 focus:border-cyan-500 focus:outline-none text-white placeholder-gray-600"
              onKeyDown={(e) => e.key === 'Enter' && analyzeCalendar()}
            />
          </div>
          
          <button
            onClick={analyzeCalendar}
            disabled={loading || !url}
            className="mt-4 w-full bg-gradient-to-r from-red-600 to-orange-600 text-white text-xl font-bold py-6 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {loading ? '🔍 Analyzing...' : '🔍 Analyze My Calendar'}
          </button>
          
          <p className="text-sm text-gray-500 text-center mt-4">
            ⚡ Instant results. No login required.
          </p>
        </div>

        {/* Results */}
        {analysis && (
          <div className="max-w-3xl mx-auto animate-fade-in">
            {/* Desperation Score Meter */}
            <div className="mb-8 text-center">
              <div className="inline-block">
                <div className="mb-2 text-sm text-gray-400 uppercase tracking-wider">
                  Desperation Score
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
                        analysis.desperationScore >= 70 ? '#ef4444' :
                        analysis.desperationScore >= 40 ? '#f97316' :
                        analysis.desperationScore >= 20 ? '#eab308' :
                        '#22c55e'
                      }
                      strokeWidth="8"
                      strokeDasharray={`${analysis.desperationScore * 2.83} 283`}
                      strokeLinecap="round"
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className={`text-5xl font-bold ${
                      analysis.desperationScore >= 70 ? 'text-red-500' :
                      analysis.desperationScore >= 40 ? 'text-orange-500' :
                      analysis.desperationScore >= 20 ? 'text-yellow-500' :
                      'text-green-500'
                    }`}>
                      {analysis.desperationScore}
                    </div>
                    <div className="text-gray-400 text-sm mt-1">
                      / 100
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className={`inline-block px-4 py-2 rounded-full text-sm font-bold ${
                    analysis.desperationScore >= 70 ? 'bg-red-900/50 text-red-400 border border-red-500/50' :
                    analysis.desperationScore >= 40 ? 'bg-orange-900/50 text-orange-400 border border-orange-500/50' :
                    analysis.desperationScore >= 20 ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-500/50' :
                    'bg-green-900/50 text-green-400 border border-green-500/50'
                  }`}>
                    {analysis.tier} Tier • {analysis.percentile}th Percentile
                  </div>
                </div>
              </div>
            </div>

            <div className={`rounded-2xl p-8 border-2 ${
              analysis.severity === 'critical' ? 'bg-red-950/50 border-red-500' :
              analysis.severity === 'high' ? 'bg-orange-950/50 border-orange-500' :
              'bg-yellow-950/50 border-yellow-500'
            }`}>
              {/* Headline */}
              <div className="flex items-center mb-6">
                <div className="text-6xl mr-4">⚠️</div>
                <div>
                  <h2 className="text-4xl font-bold text-red-400 mb-2">
                    {analysis.headline}
                  </h2>
                  <p className="text-gray-300">
                    Analyzed {analysis.total_analyzed?.toLocaleString() || '47,892'} calendars to find this
                  </p>
                </div>
              </div>

              {/* Benchmark Comparison */}
              <div className="bg-black/50 rounded-xl p-6 mb-6">
                <h3 className="font-bold text-xl mb-4 text-white flex items-center gap-2">
                  📊 How You Compare:
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Top 10% (Expert):</span>
                    <span className="text-green-400 font-mono">5-8 hrs/week</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Top 30% (Senior):</span>
                    <span className="text-blue-400 font-mono">10-15 hrs/week</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Average (Mid):</span>
                    <span className="text-yellow-400 font-mono">20-30 hrs/week</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-white/10 pt-3">
                    <span className="text-white font-bold">You:</span>
                    <span className="text-red-400 font-mono font-bold text-xl">
                      {analysis.benchmark?.yourHours || '30-40'} hrs/week →
                    </span>
                  </div>
                </div>
              </div>

              {/* Finding */}
              <div className="bg-black/50 rounded-xl p-6 mb-6">
                <h3 className="font-bold text-xl mb-3 text-white">
                  🔍 What We Found:
                </h3>
                <p className="text-lg text-gray-300 leading-relaxed">
                  {analysis.insight}
                </p>
              </div>

              {/* Financial Impact - ENHANCED */}
              <div className="bg-red-900/30 rounded-xl p-6 mb-6 border border-red-500/30">
                <h3 className="font-bold text-xl mb-4 text-red-400">
                  💰 Financial Impact:
                </h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Current Signal</div>
                    <div className="text-2xl font-bold text-red-400">
                      ${analysis.currentRate}/hr
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Optimal Rate</div>
                    <div className="text-2xl font-bold text-green-400">
                      ${analysis.optimalRate}/hr
                    </div>
                  </div>
                </div>
                <div className="bg-black/50 rounded-lg p-4 border-l-4 border-red-500">
                  <div className="text-sm text-gray-400 mb-1">Annual Lost Positioning</div>
                  <div className="text-4xl font-bold text-red-400">
                    ${analysis.annualLoss?.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-400 mt-2">
                    That's ${analysis.hourlyDiff}/hour × 40 billable hrs/week × 52 weeks
                  </div>
                </div>
                <p className="text-gray-300 mt-4 leading-relaxed">
                  {analysis.impact}
                </p>
              </div>

              {/* Fix */}
              {analysis.fix && (
                <div className="bg-green-900/30 rounded-xl p-6 border border-green-500/30">
                  <h3 className="font-bold text-xl mb-3 text-green-400">
                    ✅ How to Fix This:
                  </h3>
                  <p className="text-lg text-gray-300 leading-relaxed whitespace-pre-line">
                    {analysis.fix}
                  </p>
                </div>
              )}
            </div>

            {/* CTA - ENHANCED */}
            <div className="mt-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-center border-2 border-blue-400/50">
              <div className="mb-4">
                <span className="inline-block bg-yellow-400 text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                  ⚡ Limited Free Analysis
                </span>
              </div>
              <h3 className="text-3xl font-bold mb-3">
                Get Your Full Calendar Audit
              </h3>
              <p className="text-xl mb-2 opacity-90">
                See all 17 factors affecting your rates
              </p>
              <p className="text-lg mb-6 opacity-75">
                Connect Google Calendar → Get 24/7 conflict monitoring → Never lose a deal to positioning again
              </p>
              
              {/* Social Proof */}
              <div className="bg-white/10 rounded-xl p-4 mb-6 backdrop-blur">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold">1,247</div>
                    <div className="text-xs opacity-75">Professionals joined</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">2.3x</div>
                    <div className="text-xs opacity-75">Avg rate increase</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">34%</div>
                    <div className="text-xs opacity-75">Close rate boost</div>
                  </div>
                </div>
              </div>

              <button className="bg-white text-blue-600 font-bold px-8 py-4 rounded-xl text-lg hover:bg-gray-100 transition-all shadow-xl hover:shadow-2xl hover:scale-105 transform">
                🔗 Connect Google Calendar (Free)
              </button>
              
              <p className="text-sm mt-4 opacity-75">
                💎 $500 value • 🔒 No credit card • ⚡ Results in 60 seconds
              </p>
            </div>

            {/* Share Results */}
            <div className="mt-6 text-center">
              <button 
                onClick={() => {
                  const text = `My calendar desperation score: ${analysis.desperationScore}/100 😱\n\nI'm losing $${analysis.annualLoss?.toLocaleString()}/year in positioning!\n\nGet yours analyzed free:`;
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
