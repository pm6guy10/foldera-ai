'use client';

import { useState, useEffect } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface PendingAction {
  id: string;
  user_id: string;
  type: string;
  data: {
    file_moves: Array<{
      file: string;
      move_to: string;
    }>;
    file_count: number;
  };
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
}

// --- SAFE INITIALIZATION ---
// We do NOT throw errors here. We just return null if keys are missing.
const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) return null;
  
  try {
    return createClient(url, key);
  } catch (e) {
    console.error("Supabase init failed:", e);
    return null;
  }
};

interface JanitorExecuteClientProps {
  actionId: string;
}

export default function JanitorExecuteClient({ actionId }: JanitorExecuteClientProps) {
  const [action, setAction] = useState<PendingAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!actionId) return;
    
    const fetchAction = async () => {
      const supabase = getSupabase();
      if (!supabase) {
        setError('Missing API Keys. Check Vercel Settings.');
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('pending_actions')
          .select('*')
          .eq('id', actionId)
          .single();

        if (fetchError) {
          console.error('[Janitor] Error fetching action:', fetchError);
          setError('Failed to load cleanup plan. Please check the link.');
          return;
        }

        setAction(data as PendingAction);
      } catch (err: any) {
        console.error('[Janitor] Error:', err);
        setError(err.message || 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchAction();
  }, [actionId]);

  const handleExecute = async () => {
    if (!action || action.status === 'completed') {
      return;
    }

    setExecuting(true);
    setError(null);
    setExecutionResult(null);

    try {
      const response = await fetch(`/api/janitor/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actionId: actionId, // Use actionId as per requirements
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Execution failed');
      }

      setExecutionResult({
        success: true,
        message: result.message || 'Cleanup executed successfully!',
      });

      // Refresh action status
      const supabase = getSupabase();
      if (supabase) {
        const { data } = await supabase
          .from('pending_actions')
          .select('*')
          .eq('id', actionId)
          .single();
        
        if (data) {
          setAction(data as PendingAction);
        }
      }
    } catch (err: any) {
      console.error('[Janitor] Execution error:', err);
      setError(err.message || 'Failed to execute cleanup');
      setExecutionResult({
        success: false,
        message: err.message || 'Execution failed',
      });
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading mission briefing...</div>
      </div>
    );
  }

  if (error && !action) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (!action) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Action not found</div>
      </div>
    );
  }

  const fileMoves = action.data?.file_moves || [];
  const fileCount = action.data?.file_count || fileMoves.length;
  const isCompleted = action.status === 'completed';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-2">🧹 Mission Briefing</h1>
          <p className="text-slate-400">Drive Cleanup Operation</p>
        </div>

        {/* Status Card */}
        <div className={`bg-slate-900 border rounded-xl p-6 mb-6 ${
          isCompleted ? 'border-green-500/50' : 'border-slate-800'
        }`}>
          {isCompleted ? (
            <div className="flex items-center gap-3">
              <div className="text-3xl">✅</div>
              <div>
                <h2 className="text-2xl font-bold text-green-400">Mission Accomplished</h2>
                <p className="text-slate-400 mt-1">Your Drive has been organized successfully.</p>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                I found {fileCount} files to organize.
              </h2>
              <p className="text-slate-400">Review the cleanup plan below and execute when ready.</p>
            </div>
          )}
        </div>

        {/* File Moves List */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
          <h3 className="text-xl font-semibold text-white mb-4">Cleanup Plan</h3>
          <div className="space-y-2">
            {fileMoves.map((move, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700"
              >
                <span className="text-slate-400 font-mono text-sm min-w-[2rem]">#{index + 1}</span>
                <div className="flex-1">
                  <div className="text-slate-200 font-medium">{move.file}</div>
                  <div className="text-slate-400 text-sm flex items-center gap-2 mt-1">
                    <span>→</span>
                    <span>{move.move_to}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Button */}
        {!isCompleted && (
          <div className="text-center">
            {executionResult && (
              <div className={`mb-4 p-4 rounded-lg ${
                executionResult.success
                  ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                  : 'bg-red-500/20 border border-red-500/50 text-red-400'
              }`}>
                {executionResult.message}
              </div>
            )}
            
            {error && (
              <div className="mb-4 p-4 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400">
                {error}
              </div>
            )}

            <button
              onClick={handleExecute}
              disabled={executing}
              className={`px-8 py-4 rounded-lg font-bold text-lg transition-colors ${
                executing
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {executing ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Executing Cleanup...
                </span>
              ) : (
                'CONFIRM & EXECUTE'
              )}
            </button>
          </div>
        )}

        {/* Footer Info */}
        <div className="mt-8 pt-6 border-t border-slate-800 text-center text-sm text-slate-500">
          <p>Action ID: {action.id}</p>
          <p className="mt-1">Created: {new Date(action.created_at).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

