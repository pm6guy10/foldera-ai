'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';

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
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-400 text-sm">Loading...</div>
      </div>
    );
  }

  // Show sign-in prompt if not authenticated
  if (status !== 'authenticated') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-red-400 mb-4 text-sm">Please sign in to view settings</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => signIn('google', { callbackUrl: '/dashboard/settings' })}
              className="px-4 py-2 bg-white text-black hover:bg-zinc-100 rounded-lg font-medium transition-colors text-sm"
            >
              Sign in with Google
            </button>
            <button
              onClick={() => signIn('azure-ad', { callbackUrl: '/dashboard/settings' })}
              className="px-4 py-2 bg-[#00a4ef] text-white hover:bg-[#0078d4] rounded-lg font-medium transition-colors text-sm"
            >
              Sign in with Microsoft
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main view — no full-page wrapper; the dashboard shell provides the background
  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-50 tracking-tight">Settings</h1>
        <p className="text-zinc-400 text-sm mt-1">Manage your connected accounts</p>
      </div>

      {/* CONNECTORS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* GMAIL CARD */}
        <ConnectorCard
          name="Gmail"
          description="Email intelligence"
          icon="📧"
          isConnected={integrations.some(i => i.provider === 'google' && i.is_active)}
          onConnect={() => signIn('google', { callbackUrl: '/dashboard/settings' })}
        />

        {/* OUTLOOK CARD */}
        <ConnectorCard
          name="Outlook"
          description="Calendar & email"
          icon="📅"
          isConnected={integrations.some(i => i.provider === 'azure_ad' && i.is_active)}
          onConnect={() => signIn('azure-ad', { callbackUrl: '/dashboard/settings' })}
        />
      </div>

      <p className="text-zinc-600 text-xs">All integrations secured with OAuth 2.0.</p>
    </div>
  );
}

function ConnectorCard({ name, description, icon, isConnected, onConnect }: any) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center text-xl">{icon}</div>
          <div>
            <h3 className="font-semibold text-zinc-50">{name}</h3>
            <p className="text-zinc-500 text-sm">{description}</p>
          </div>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full text-xs font-medium border border-emerald-500/20">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            Connected
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-zinc-800 text-zinc-500 px-2.5 py-1 rounded-full text-xs font-medium border border-zinc-700">
            <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full" />
            Not connected
          </div>
        )}
      </div>

      {isConnected ? (
        <button className="w-full py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors">
          Reconnect
        </button>
      ) : (
        <button onClick={onConnect} className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors">
          Connect
        </button>
      )}
    </div>
  );
}
