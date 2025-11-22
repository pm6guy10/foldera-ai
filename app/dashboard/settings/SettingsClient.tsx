'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { ClipboardList } from 'lucide-react';

export default function SettingsClient() {
  const { data: session, status } = useSession();
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // --- FETCH DATA ---
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.email) {
      setLoading(false);
      return;
    }

    const fetchIntegrations = async () => {
      try {
        // Fetch from API route (uses service role to bypass RLS)
        const response = await fetch('/api/integrations/status');
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch integrations');
        }

        const { integrations: fetchedIntegrations } = await response.json();
        setIntegrations(fetchedIntegrations || []);
        setLastChecked(new Date());
        setLoading(false);
        
        // Debug log to help troubleshoot
        if (fetchedIntegrations && fetchedIntegrations.length > 0) {
          console.log('[Settings] Integrations loaded:', fetchedIntegrations.map((i: any) => ({
            provider: i.provider,
            is_active: i.is_active
          })));
        } else {
          console.log('[Settings] No integrations found. User may need to sign in again.');
        }
      } catch (err: any) {
        console.error("Fetch error:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchIntegrations();
    // Refresh every 5s to catch the "Green Dot" update after OAuth flow
    const interval = setInterval(fetchIntegrations, 5000);
    return () => clearInterval(interval);
  }, [session, status]);

  // --- RENDERING ---
  
  // Show loading state
  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div>Loading Command Center...</div>
      </div>
    );
  }


  // Show sign-in prompt if not authenticated
  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Please sign in to view settings</p>
          <button
            onClick={() => signIn('google', { callbackUrl: '/dashboard/settings' })}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // Main dashboard view
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto">
        {/* HEADER */}
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Command Center</h1>
            <p className="text-slate-400 mt-2">Manage your integrations and AI controls</p>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/dashboard/briefing"
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <ClipboardList className="w-4 h-4" />
              Briefing
            </a>
            <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-full text-sm font-medium transition-colors">
              PAUSE ALL AI <div className="w-8 h-4 bg-emerald-500 rounded-full relative ml-2"><div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow"></div></div>
            </button>
          </div>
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
            Connected
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-slate-700/50 text-slate-400 px-3 py-1 rounded-full text-xs font-medium border border-slate-700/50">
            <div className="w-2 h-2 bg-slate-500 rounded-full"></div>
            Disconnected
          </div>
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
