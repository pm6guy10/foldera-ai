'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { createClient } from '@supabase/supabase-js';
import { CheckCircle, AlertCircle, RefreshCw, ExternalLink, Pause, Play } from 'lucide-react';

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

export default function SettingsClient() {
  const { data: session, status } = useSession();
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // --- CHECK KEYS ON MOUNT ---
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error("CRITICAL: Missing Env Vars");
      setConfigError("Missing API Keys. Check Vercel Settings.");
    }
  }, []);

  // --- FETCH DATA ---
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.email) return;

    const fetchIntegrations = async () => {
      const supabase = getSupabase();
      if (!supabase) {
        // If we can't get a client, stop trying to fetch.
        return; 
      }

      try {
        // 1. Get User ID
        const { data: user } = await supabase
          .from('meeting_prep_users')
          .select('id')
          .eq('email', session.user.email)
          .single();

        if (!user) {
          console.log("User not found in DB yet.");
          setLoading(false);
          return;
        }

        // 2. Get Integrations
        const { data } = await supabase
          .from('integrations')
          .select('*')
          .eq('user_id', user.id);

        setIntegrations(data || []);
        setLoading(false);
      } catch (err: any) {
        console.error("Fetch error:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchIntegrations();
    // Refresh every 5s to catch the "Green Dot" update
    const interval = setInterval(fetchIntegrations, 5000);
    return () => clearInterval(interval);
  }, [session, status]);




  // --- RENDERING ---

  // 1. SESSION LOADING
  if (status === 'loading') {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Loading Command Center...</div>;
  }

  // 2. CONFIG ERROR (The Red Box)
  if (configError) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-10 flex flex-col items-center justify-center">
        <div className="bg-red-900/50 border border-red-500 p-6 rounded-lg max-w-md">
          <h2 className="text-xl font-bold text-red-200 mb-2">System Config Error</h2>
          <p className="text-red-100">{configError}</p>
          <p className="text-xs text-red-300 mt-4 font-mono">NEXT_PUBLIC_SUPABASE_URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Defined' : 'MISSING'}</p>
          <p className="text-xs text-red-300 font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Defined' : 'MISSING'}</p>
        </div>
      </div>
    );
  }

  // 3. MAIN DASHBOARD
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto">
        {/* HEADER */}
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Command Center</h1>
            <p className="text-slate-400 mt-2">Manage your integrations and AI controls</p>
          </div>
          <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-full text-sm font-medium transition-colors">
            PAUSE ALL AI <div className="w-8 h-4 bg-emerald-500 rounded-full relative ml-2"><div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow"></div></div>
          </button>
        </div>

        {/* CONNECTORS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* GOOGLE DRIVE CARD */}
          <ConnectorCard 
            name="Google Drive" 
            description="File Organization" 
            icon="📁"
            isConnected={integrations.some(i => i.provider === 'google_drive' && i.is_active)}
            onConnect={() => signIn('google', { callbackUrl: '/dashboard/settings' })}
          />
          
          {/* GMAIL CARD */}
          <ConnectorCard 
            name="Gmail" 
            description="Email Intelligence" 
            icon="📧"
            isConnected={integrations.some(i => i.provider === 'gmail' && i.is_active)}
            onConnect={() => signIn('google', { callbackUrl: '/dashboard/settings' })}
          />
        </div>
        
        <p className="text-center text-slate-600 text-xs mt-12">All integrations secured with OAuth 2.0.</p>
      </div>
    </div>
  );
}

function ConnectorCard({ name, description, icon, isConnected, onConnect }: any) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-all">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center text-2xl">{icon}</div>
          <div>
            <h3 className="font-semibold text-lg text-white">{name}</h3>
            <p className="text-slate-400 text-sm">{description}</p>
          </div>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-medium border border-emerald-500/20">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            Active
          </div>
        ) : (
          <div className="w-3 h-3 bg-slate-700 rounded-full"></div>
        )}
      </div>
      
      {isConnected ? (
        <button className="w-full py-3 rounded-lg bg-slate-800 text-slate-300 text-sm font-medium hover:bg-slate-700 transition-colors">
          Manage Settings
        </button>
      ) : (
        <button onClick={onConnect} className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-colors shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)]">
          Connect
        </button>
      )}
    </div>
  );
}
