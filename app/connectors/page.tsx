'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';

interface Connector {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'connected' | 'available' | 'coming_soon';
  benefits: string[];
  color: string;
}

const connectors: Connector[] = [
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Find scheduling conflicts and optimize your time',
    icon: '📅',
    status: 'available',
    benefits: [
      'Double-booking detection',
      'Missing prep time alerts',
      'Overloaded day warnings',
      'Focus time identification'
    ],
    color: 'from-blue-500 to-cyan-500'
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Monitor revenue risks and payment issues',
    icon: '💳',
    status: 'coming_soon',
    benefits: [
      'Failed payment alerts',
      'Revenue trend analysis',
      'Churn risk detection',
      'Cash flow insights'
    ],
    color: 'from-purple-500 to-pink-500'
  },
  {
    id: 'jira',
    name: 'Jira/Linear',
    description: 'Track project risks and team bottlenecks',
    icon: '🎯',
    status: 'coming_soon',
    benefits: [
      'Sprint capacity warnings',
      'Blocking issue alerts',
      'Deadline risk detection',
      'Team velocity insights'
    ],
    color: 'from-green-500 to-teal-500'
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Monitor code quality and deployment risks',
    icon: '🔧',
    status: 'coming_soon',
    benefits: [
      'Security vulnerability tracking',
      'PR approval bottlenecks',
      'Code velocity analysis',
      'Technical debt alerts'
    ],
    color: 'from-orange-500 to-red-500'
  },
  {
    id: 'hubspot',
    name: 'HubSpot/Salesforce',
    description: 'Track pipeline health and customer risks',
    icon: '📈',
    status: 'coming_soon',
    benefits: [
      'Deal stagnation alerts',
      'Customer churn warnings',
      'Pipeline gap analysis',
      'Follow-up reminders'
    ],
    color: 'from-indigo-500 to-purple-500'
  },
  {
    id: 'slack',
    name: 'Slack/Teams',
    description: 'Surface communication gaps and decisions',
    icon: '💬',
    status: 'coming_soon',
    benefits: [
      'Unresolved discussions',
      'Decision bottlenecks',
      'Information silos',
      'Action item tracking'
    ],
    color: 'from-pink-500 to-rose-500'
  }
];

export default function ConnectorsPage() {
  const [connectedConnectors, setConnectedConnectors] = useState<Set<string>>(new Set());
  const [calendarInsights, setCalendarInsights] = useState<any>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check for successful connections
    const connected = searchParams.get('connected');
    const success = searchParams.get('success');

    if (connected === 'calendar' && success === 'true') {
      setConnectedConnectors(prev => new Set(prev).add('google_calendar'));

      // Fetch calendar insights
      fetchCalendarInsights();
    }
  }, [searchParams]);

  const fetchCalendarInsights = async () => {
    try {
      // In production, get access token from stored credentials
      // For demo, we'll simulate insights
      const mockInsights = {
        events_analyzed: 47,
        calendar_conflicts: [
          {
            type: 'double_booking',
            severity: 'critical',
            title: 'Double-Booked Meeting',
            description: 'Team standup overlaps with client call',
            business_impact: 'Missed stakeholder communication',
            recommended_action: 'Reschedule client call or delegate attendance'
          }
        ],
        calendar_insights: [
          {
            type: 'overloaded_day',
            title: 'Heavy Meeting Load',
            description: 'Tuesday has 8 meetings scheduled',
            business_impact: 'Reduced productivity and burnout risk'
          }
        ]
      };
      setCalendarInsights(mockInsights);
    } catch (error) {
      console.error('Failed to fetch calendar insights:', error);
    }
  };

  const connectConnector = async (connectorId: string) => {
    if (connectorId === 'google_calendar') {
      window.location.href = '/api/auth/google/calendar';
    }
    // Add other connector logic here
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-3 mb-6"
          >
            <Image src="/foldera-glyph.svg" alt="Foldera" width={48} height={48} />
            <h1 className="text-4xl font-bold">Connect Your Data Sources</h1>
          </motion.div>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Connect your tools for continuous insights. Foldera monitors your data in real-time to find conflicts before they become problems.
          </p>
        </div>

        {/* Connection Status */}
        {connectedConnectors.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-green-900/20 border border-green-800 rounded-lg p-6 mb-8"
          >
            <h2 className="text-xl font-semibold text-green-400 mb-4 flex items-center">
              <span className="text-2xl mr-2">✅</span>
              Connected Sources ({connectedConnectors.size})
            </h2>
            <div className="flex flex-wrap gap-2">
              {Array.from(connectedConnectors).map(connectorId => {
                const connector = connectors.find(c => c.id === connectorId);
                return connector ? (
                  <span key={connectorId} className="px-3 py-1 bg-green-800/50 rounded-full text-sm">
                    {connector.icon} {connector.name}
                  </span>
                ) : null;
              })}
            </div>
          </motion.div>
        )}

        {/* Live Insights */}
        {calendarInsights && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-800/30 rounded-lg p-8 mb-8 border border-slate-700"
          >
            <h2 className="text-2xl font-bold text-cyan-400 mb-6 flex items-center">
              <span className="text-3xl mr-3">📊</span>
              Live Calendar Insights
            </h2>

            <div className="grid md:grid-cols-3 gap-6 mb-6">
              <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-cyan-400 mb-2">
                  {calendarInsights.events_analyzed}
                </div>
                <div className="text-gray-400">Events Analyzed</div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-red-400 mb-2">
                  {calendarInsights.calendar_conflicts.length}
                </div>
                <div className="text-gray-400">Conflicts Found</div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-400 mb-2">
                  {calendarInsights.calendar_insights.length}
                </div>
                <div className="text-gray-400">Insights Generated</div>
              </div>
            </div>

            {/* Conflicts */}
            {calendarInsights.calendar_conflicts.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-red-400 mb-3">🚨 Critical Conflicts</h3>
                <div className="space-y-3">
                  {calendarInsights.calendar_conflicts.map((conflict, i) => (
                    <div key={i} className="bg-red-900/20 border border-red-800 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-red-400">{conflict.title}</h4>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          conflict.severity === 'critical' ? 'bg-red-800 text-red-200' : 'bg-yellow-800 text-yellow-200'
                        }`}>
                          {conflict.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm mb-2">{conflict.description}</p>
                      <p className="text-green-400 text-sm font-medium">{conflict.recommended_action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Insights */}
            <div>
              <h3 className="text-lg font-semibold text-cyan-400 mb-3">💡 Optimization Opportunities</h3>
              <div className="space-y-3">
                {calendarInsights.calendar_insights.map((insight, i) => (
                  <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                    <h4 className="font-semibold text-cyan-400 mb-2">{insight.title}</h4>
                    <p className="text-gray-300 text-sm">{insight.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Connectors Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {connectors.map((connector, index) => (
            <motion.div
              key={connector.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative rounded-2xl p-6 border ${
                connectedConnectors.has(connector.id)
                  ? 'border-green-500 bg-green-900/20'
                  : connector.status === 'available'
                  ? 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
                  : 'border-slate-800 bg-slate-900/30'
              }`}
            >
              {connectedConnectors.has(connector.id) && (
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
              )}

              <div className="text-center mb-6">
                <div className={`inline-flex p-4 rounded-full bg-gradient-to-r ${connector.color} mb-4`}>
                  <span className="text-2xl">{connector.icon}</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">{connector.name}</h3>
                <p className="text-gray-400 text-sm">{connector.description}</p>
              </div>

              <div className="space-y-2 mb-6">
                {connector.benefits.map((benefit, i) => (
                  <div key={i} className="flex items-center space-x-2">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></div>
                    <span className="text-sm text-gray-300">{benefit}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => connectConnector(connector.id)}
                disabled={connector.status !== 'available'}
                className={`w-full py-3 rounded-lg font-semibold transition-all ${
                  connectedConnectors.has(connector.id)
                    ? 'bg-green-600 text-white cursor-default'
                    : connector.status === 'available'
                    ? 'bg-gradient-to-r from-cyan-600 to-purple-600 text-white hover:from-cyan-500 hover:to-purple-500 shadow-lg hover:shadow-xl transform hover:scale-105'
                    : 'bg-slate-800 text-gray-500 cursor-not-allowed'
                }`}
              >
                {connectedConnectors.has(connector.id)
                  ? 'Connected ✓'
                  : connector.status === 'coming_soon'
                  ? 'Coming Soon'
                  : 'Connect Source'
                }
              </button>
            </motion.div>
          ))}
        </div>

        {/* Privacy & Security */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Your Data Security</h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-green-400 mb-3">✅ What We Do</h3>
              <ul className="space-y-2 text-sm text-gray-300">
                <li>• Read-only access only</li>
                <li>• Encrypted data storage</li>
                <li>• SOC2 compliant security</li>
                <li>• No human data access</li>
                <li>• Automatic data deletion</li>
              </ul>
            </div>

            <div className="bg-slate-800/30 rounded-lg p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-red-400 mb-3">❌ What We Don't Do</h3>
              <ul className="space-y-2 text-sm text-gray-300">
                <li>• Store passwords</li>
                <li>• Share with third parties</li>
                <li>• Allow human review</li>
                <li>• Keep data after disconnect</li>
                <li>• Access personal emails</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
