'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { ClipboardList, RefreshCw, CheckCircle } from 'lucide-react';
import { SignalIcon } from '@/components/dashboard/SignalIcon';

export default function BriefingClient() {
  const { data: session, status } = useSession();
  const [briefing, setBriefing] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.email) return;

    fetchBriefing();
  }, [status, session]);

  const fetchBriefing = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/briefing/latest');

      if (!response.ok) {
        throw new Error('Failed to fetch briefing');
      }

      const data = await response.json();
      setBriefing(data.briefing || '');
    } catch (err: any) {
      console.error('[Briefing] Error fetching briefing:', err);
      setError(err.message || 'Failed to load briefing');
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = () => {
    setAcknowledged(true);
    // TODO: Store acknowledgment in database
    // For now, just mark as acknowledged in state
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-slate-400">Loading briefing...</div>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-red-400">Please sign in to view your briefing</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
              <ClipboardList className="w-10 h-10" />
              Monday Morning Briefing
            </h1>
            <p className="text-slate-400">Your Knowledge Graph status and critical alerts</p>
          </div>
          <button
            onClick={fetchBriefing}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Loading State */}
        {loading && !briefing && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
            <div className="text-slate-400">Generating your briefing...</div>
            <div className="text-slate-500 text-sm mt-2">Analyzing conflicts and relationships</div>
          </div>
        )}

        {/* Error State */}
        {error && !briefing && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-6">
            <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Briefing</h2>
            <p className="text-red-200">{error}</p>
            <button
              onClick={fetchBriefing}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Briefing Content */}
        {briefing && !loading && (
          <>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 mb-6">
              {/* Legend for Signal Sources */}
              <div className="flex gap-4 mb-6 text-sm text-slate-400 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <SignalIcon source="outlook" className="w-4 h-4" />
                  <span>Outlook</span>
                </div>
                <div className="flex items-center gap-2">
                  <SignalIcon source="gmail" className="w-4 h-4" />
                  <span>Gmail</span>
                </div>
                <div className="flex items-center gap-2">
                  <SignalIcon source="slack" className="w-4 h-4" />
                  <span>Slack</span>
                </div>
                <div className="flex items-center gap-2">
                  <SignalIcon source="calendar" className="w-4 h-4" />
                  <span>Calendar</span>
                </div>
              </div>

              {/* Render Markdown with simple formatting */}
              <div 
                className="text-slate-300 leading-relaxed whitespace-pre-wrap
                  [&>h1]:text-3xl [&>h1]:font-bold [&>h1]:mb-6 [&>h1]:mt-8 [&>h1]:text-white
                  [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:mt-8 [&>h2]:mb-4 [&>h2]:text-cyan-400
                  [&>h3]:text-xl [&>h3]:font-semibold [&>h3]:mt-6 [&>h3]:mb-3 [&>h3]:text-white
                  [&>p]:mb-4 [&>p]:text-slate-300
                  [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4 [&>ul]:text-slate-300
                  [&>li]:my-2
                  [&>strong]:text-white [&>strong]:font-semibold
                  [&>hr]:border-slate-700 [&>hr]:my-8"
              >
                {briefing}
              </div>
            </div>

            {/* Action Button */}
            {!acknowledged && (
              <div className="flex justify-end">
                <button
                  onClick={handleAcknowledge}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  <CheckCircle className="w-5 h-5" />
                  Acknowledge & Archive
                </button>
              </div>
            )}

            {acknowledged && (
              <div className="flex justify-end">
                <div className="flex items-center gap-2 text-emerald-400 px-6 py-3 rounded-lg bg-emerald-900/20 border border-emerald-500/20">
                  <CheckCircle className="w-5 h-5" />
                  Briefing Acknowledged
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

