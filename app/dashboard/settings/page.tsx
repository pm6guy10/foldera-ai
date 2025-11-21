'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { signIn } from 'next-auth/react';

// Supabase client (using anon key for client-side)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type IntegrationProvider = 'gmail' | 'google_drive' | 'google_calendar' | 'notion';

interface Integration {
  id: string;
  provider: IntegrationProvider;
  is_active: boolean;
  last_synced_at: string | null;
  sync_status: 'idle' | 'syncing' | 'error';
}

interface ConnectorCard {
  provider: IntegrationProvider;
  name: string;
  description: string;
  icon: string;
  isBeta?: boolean;
}

const CONNECTORS: ConnectorCard[] = [
  {
    provider: 'gmail',
    name: 'Gmail',
    description: 'Email Intelligence',
    icon: '📧',
  },
  {
    provider: 'google_calendar',
    name: 'Google Calendar',
    description: 'Time & Scheduling',
    icon: '📅',
  },
  {
    provider: 'google_drive',
    name: 'Google Drive',
    description: 'File Organization',
    icon: '📁',
  },
  {
    provider: 'notion',
    name: 'Notion',
    description: 'Second Brain',
    icon: '🧠',
    isBeta: true,
  },
];

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return 'Never';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function SettingsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchIntegrations = async () => {
    try {
      // Get current user from auth
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.email) {
        console.error('No authenticated user found');
        setLoading(false);
        return;
      }

      // Get user from meeting_prep_users table (since integrations references it)
      const { data: meetingPrepUser, error: userError } = await supabase
        .from('meeting_prep_users')
        .select('id, email')
        .eq('email', authUser.email)
        .single();

      if (userError || !meetingPrepUser) {
        console.error('User not found in meeting_prep_users:', userError);
        setLoading(false);
        return;
      }

      setUserId(meetingPrepUser.id);

      // Fetch integrations for this user
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', meetingPrepUser.id);

      if (error) {
        console.error('Error fetching integrations:', error);
      } else {
        setIntegrations(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
    
    // Refresh integrations when page becomes visible (user returns from OAuth)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchIntegrations();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const getIntegration = (provider: IntegrationProvider): Integration | undefined => {
    return integrations.find((int) => int.provider === provider);
  };

  const handleConnect = async (provider: IntegrationProvider) => {
    console.log(`Connecting ${provider}...`);
    
    // Gmail and Google Drive use the same Google OAuth
    if (provider === 'gmail' || provider === 'google_drive') {
      // Trigger Google OAuth via NextAuth
      await signIn('google', { 
        callbackUrl: '/dashboard/settings',
        redirect: true 
      });
    } else if (provider === 'google_calendar') {
      // Google Calendar also uses Google OAuth
      await signIn('google', { 
        callbackUrl: '/dashboard/settings',
        redirect: true 
      });
    } else if (provider === 'notion') {
      // TODO: Wire up Notion OAuth
      console.log('Notion OAuth coming soon');
      alert('Notion integration coming soon!');
    }
  };

  const handleDisconnect = async (provider: IntegrationProvider) => {
    const integration = getIntegration(provider);
    if (!integration) return;

    try {
      const { error } = await supabase
        .from('integrations')
        .update({ is_active: false })
        .eq('id', integration.id);

      if (error) {
        console.error('Error disconnecting:', error);
        alert('Failed to disconnect. Please try again.');
      } else {
        // Update local state
        setIntegrations((prev) =>
          prev.map((int) =>
            int.id === integration.id ? { ...int, is_active: false } : int
          )
        );
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to disconnect. Please try again.');
    }
  };

  const handleTogglePause = () => {
    setIsPaused(!isPaused);
    console.log(`AI ${isPaused ? 'resumed' : 'paused'}`);
    // TODO: Implement actual pause logic
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Command Center</h1>
              <p className="text-slate-400">Manage your integrations and AI controls</p>
            </div>
            
            {/* Kill Switch */}
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
              <span className="text-sm text-slate-300">PAUSE ALL AI</span>
              <button
                onClick={handleTogglePause}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isPaused ? 'bg-red-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isPaused ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Connector Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CONNECTORS.map((connector) => {
            const integration = getIntegration(connector.provider);
            const isConnected = integration?.is_active === true;

            return (
              <div
                key={connector.provider}
                className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{connector.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-semibold text-white">
                          {connector.name}
                        </h3>
                        {connector.isBeta && (
                          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded">
                            BETA
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 mt-1">
                        {connector.description}
                      </p>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  {isConnected && (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-xs text-green-400 font-medium">Active</span>
                    </div>
                  )}
                </div>

                {/* Card Body */}
                {isConnected ? (
                  <div className="space-y-4">
                    <div className="text-sm text-slate-400">
                      Last synced: {formatTimeAgo(integration?.last_synced_at || null)}
                    </div>
                    <button
                      onClick={() => handleDisconnect(connector.provider)}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleConnect(connector.provider)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors font-medium"
                  >
                    Connect
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Info */}
        <div className="mt-12 pt-8 border-t border-slate-800">
          <p className="text-sm text-slate-500 text-center">
            All integrations are secured with OAuth 2.0. Your credentials are encrypted and never stored in plain text.
          </p>
        </div>
      </div>
    </div>
  );
}

