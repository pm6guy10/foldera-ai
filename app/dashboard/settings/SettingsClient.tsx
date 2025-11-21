'use client';

import { useState, useEffect } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { signIn, useSession } from 'next-auth/react';

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

export default function SettingsClient() {
  const { data: session, status } = useSession();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Handle loading state from NextAuth
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  // Handle unauthenticated state
  if (status === 'unauthenticated' || !session?.user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Please log in to view settings.</div>
      </div>
    );
  }

  // Lazy initialization of Supabase client - only called at runtime in browser
  const getSupabaseClient = (): SupabaseClient => {
    // Ensure we're in the browser (not during SSR/build)
    if (typeof window === 'undefined') {
      throw new Error('Supabase client can only be initialized in the browser');
    }
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables. Please check your environment configuration.');
    }
    
    return createClient(supabaseUrl, supabaseAnonKey);
  };

  const fetchIntegrations = async () => {
    try {
      // Ensure we have a session before fetching
      if (!session?.user?.email) {
        console.log('[Settings] No NextAuth session found');
        setLoading(false);
        return;
      }
      
      console.log('[Settings] NextAuth session user:', session.user.email);
      
      const supabase = getSupabaseClient();
      
      // Get user from meeting_prep_users table (since integrations references it)
      // Use NextAuth email to find the user
      const { data: meetingPrepUser, error: userError } = await supabase
        .from('meeting_prep_users')
        .select('id, email')
        .eq('email', session.user.email)
        .single();

      if (userError || !meetingPrepUser) {
        console.error('[Settings] User not found in meeting_prep_users:', userError);
        setLoading(false);
        return;
      }

      console.log('[Settings] Found meeting_prep_user:', { id: meetingPrepUser.id, email: meetingPrepUser.email });
      setUserId(meetingPrepUser.id);

      // Fetch integrations for this user - check for gmail and google_drive specifically
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', meetingPrepUser.id);

      // DEBUGGING: Log raw data from Supabase
      console.log('[Settings] Raw integrations data from Supabase:', {
        count: data?.length || 0,
        data: data,
        error: error
      });

      if (error) {
        console.error('[Settings] Error fetching integrations:', error);
        setIntegrations([]);
      } else {
        const integrationsData = (data || []).map((int: any) => ({
          id: int.id,
          provider: int.provider as IntegrationProvider,
          is_active: Boolean(int.is_active),
          last_synced_at: int.last_synced_at,
          sync_status: (int.sync_status || 'idle') as 'idle' | 'syncing' | 'error',
        }));
        
        console.log('[Settings] Processed integrations:', integrationsData);
        
        // Check specific providers for debugging
        const gmailIntegration = integrationsData.find(i => i.provider === 'gmail');
        const driveIntegration = integrationsData.find(i => i.provider === 'google_drive');
        
        console.log('[Settings] Gmail integration:', gmailIntegration);
        console.log('[Settings] Google Drive integration:', driveIntegration);
        
        setIntegrations(integrationsData);
      }
    } catch (error: any) {
      console.error('[Settings] Error in fetchIntegrations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only run data fetching if we have a valid session
    if (!session?.user?.email) {
      setLoading(false);
      return;
    }
    
    // Initial fetch
    fetchIntegrations();
    
    // Refresh integrations when page becomes visible (user returns from OAuth)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Settings] Page visible, refreshing integrations...');
        fetchIntegrations();
      }
    };
    
    // Polling interval: check every 5 seconds
    const pollInterval = setInterval(() => {
      console.log('[Settings] Polling for integration updates...');
      fetchIntegrations();
    }, 5000);
    
    // Window focus listener
    const handleFocus = () => {
      console.log('[Settings] Window focused, refreshing integrations...');
      fetchIntegrations();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [session?.user?.email]);

  const getIntegration = (provider: IntegrationProvider): Integration | undefined => {
    const integration = integrations.find((int) => int.provider === provider);
    console.log(`[Settings] getIntegration(${provider}):`, integration);
    return integration;
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
      const supabase = getSupabaseClient();
      
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
        <div className="text-slate-400">Loading integrations...</div>
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
            
            // Debug log for each connector
            console.log(`[Settings] Connector ${connector.provider}:`, {
              integration,
              isConnected,
              is_active: integration?.is_active,
            });

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

