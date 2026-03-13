'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { RefreshCw, Zap, CheckCircle, Target, BarChart2 } from 'lucide-react';

interface CoSBrief {
  topInsight: string;
  confidence: number;
  recommendedAction: string;
  fullBrief: string;
  generatedAt: string;
  briefingDate: string;
  graphStats: {
    signalsTotal: number;
    commitmentsActive: number;
    patternsActive: number;
  };
}

export default function BriefingClient() {
  const { data: session, status } = useSession();
  const [brief, setBrief] = useState<CoSBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.email) return;
    fetchBrief();
  }, [status, session]);

  const fetchBrief = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/briefing/latest');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to fetch briefing');
      }
      setBrief(await res.json());
    } catch (err: any) {
      setError(err.message || 'Failed to load briefing');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-red-400">Please sign in to view your briefing</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Morning Brief</h1>
            <p className="text-slate-400 text-sm mt-1">
              {brief?.briefingDate ?? new Date().toISOString().slice(0, 10)}
            </p>
          </div>
          <button
            onClick={fetchBrief}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Loading */}
        {loading && !brief && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500 mx-auto mb-4" />
            <p className="text-slate-400">Generating your brief...</p>
          </div>
        )}

        {/* Error */}
        {error && !brief && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-6">
            <h2 className="text-xl font-bold text-red-400 mb-2">Error</h2>
            <p className="text-red-200 mb-4">{error}</p>
            <button
              onClick={fetchBrief}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Brief content */}
        {brief && !loading && (
          <div className="space-y-4">

            {/* Top Insight */}
            <div className="bg-slate-900 border border-cyan-500/30 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-5 h-5 text-cyan-400" />
                <span className="text-cyan-400 text-sm font-semibold uppercase tracking-wider">
                  Top Insight
                </span>
                {/* Confidence badge */}
                <span className={`ml-auto text-xs font-mono px-2 py-0.5 rounded-full ${
                  brief.confidence >= 70
                    ? 'bg-emerald-900/50 text-emerald-400'
                    : brief.confidence >= 40
                    ? 'bg-amber-900/50 text-amber-400'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {brief.confidence}% confidence
                </span>
              </div>
              <p className="text-white text-lg leading-relaxed">{brief.topInsight}</p>
            </div>

            {/* Recommended Action */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-cyan-400" />
                <span className="text-cyan-400 text-sm font-semibold uppercase tracking-wider">
                  Recommended Action
                </span>
              </div>
              <p className="text-slate-200 leading-relaxed">{brief.recommendedAction}</p>
            </div>

            {/* Full Brief */}
            {brief.fullBrief && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart2 className="w-5 h-5 text-slate-400" />
                  <span className="text-slate-400 text-sm font-semibold uppercase tracking-wider">
                    Full Brief
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {brief.fullBrief}
                </p>
              </div>
            )}

            {/* Graph stats */}
            {brief.graphStats && (
              <div className="grid grid-cols-3 gap-3">
                <StatPill label="Activity" value={brief.graphStats.signalsTotal} />
                <StatPill label="Active commitments" value={brief.graphStats.commitmentsActive} />
                <StatPill label="Insights" value={brief.graphStats.patternsActive} />
              </div>
            )}

            {/* Acknowledge */}
            <div className="flex justify-end pt-2">
              {!acknowledged ? (
                <button
                  onClick={() => setAcknowledged(true)}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  <CheckCircle className="w-5 h-5" />
                  Acknowledge
                </button>
              ) : (
                <div className="flex items-center gap-2 text-emerald-400 px-6 py-3 rounded-lg bg-emerald-900/20 border border-emerald-500/20">
                  <CheckCircle className="w-5 h-5" />
                  Briefing Acknowledged
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-slate-500 text-xs mt-0.5">{label}</div>
    </div>
  );
}
