# 🚀 CURSOR IMPLEMENTATION BRIEF: CONNECTOR INTELLIGENCE SYSTEM

**Version:** 1.0 FINAL  
**Status:** Ready for Implementation  
**Timeline:** Ship Phase 1 in 2 weeks  
**Purpose:** Build cross-system conflict detection with unlimited connectors

---

## **WHAT YOU'RE BUILDING**

A monitoring system that connects to multiple business tools via OAuth, detects conflicts **ACROSS systems** (not within), and presents solutions for one-click approval.

**The Differentiator:**
- Other tools: Connect to Gmail OR Salesforce OR Slack
- Foldera: Connect to ALL of them and find where they DISAGREE

---

## **PHASE 1: GOOGLE BUNDLE (Week 1-2)**

### **Ship First:**
1. Gmail OAuth integration
2. Google Calendar OAuth integration
3. Google Drive OAuth integration
4. Cross-system conflict detection (between these 3)
5. Dashboard showing connected systems

### **Core Architecture**

```typescript
// lib/connectors/types.ts
export interface Connector {
  id: string;
  name: string;
  icon: string;
  oauth_scopes: string[];
  sync_handler: string;
  category: 'communication' | 'storage' | 'calendar' | 'crm' | 'project';
  status: 'available' | 'beta' | 'coming_soon';
}

export interface ConnectorData {
  connector_id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: Date;
  last_sync: Date;
  sync_status: 'active' | 'error' | 'paused';
  metadata: Record<string, any>;
}

// lib/connectors/registry.ts
export const CONNECTOR_REGISTRY: Record<string, Connector> = {
  gmail: {
    id: 'gmail',
    name: 'Gmail',
    icon: '/icons/gmail.svg',
    oauth_scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send'
    ],
    sync_handler: 'syncGmail',
    category: 'communication',
    status: 'available'
  },
  
  google_calendar: {
    id: 'google_calendar',
    name: 'Google Calendar',
    icon: '/icons/gcal.svg',
    oauth_scopes: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    sync_handler: 'syncCalendar',
    category: 'calendar',
    status: 'available'
  },
  
  google_drive: {
    id: 'google_drive',
    name: 'Google Drive',
    icon: '/icons/gdrive.svg',
    oauth_scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file'
    ],
    sync_handler: 'syncDrive',
    category: 'storage',
    status: 'available'
  },
  
  slack: {
    id: 'slack',
    name: 'Slack',
    icon: '/icons/slack.svg',
    oauth_scopes: [
      'channels:history',
      'channels:read',
      'users:read'
    ],
    sync_handler: 'syncSlack',
    category: 'communication',
    status: 'beta'
  },
  
  notion: {
    id: 'notion',
    name: 'Notion',
    icon: '/icons/notion.svg',
    oauth_scopes: ['read_content', 'update_content'],
    sync_handler: 'syncNotion',
    category: 'project',
    status: 'beta'
  }
};
```

---

## **DATABASE SCHEMA**

```sql
-- Connected systems per user
CREATE TABLE user_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  last_sync TIMESTAMPTZ,
  sync_status TEXT CHECK (sync_status IN ('active', 'error', 'paused')) DEFAULT 'active',
  sync_error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, connector_id)
);

-- Index for fast lookups
CREATE INDEX idx_user_connectors_user ON user_connectors(user_id);
CREATE INDEX idx_user_connectors_status ON user_connectors(sync_status);

-- Cross-system conflicts detected
CREATE TABLE cross_system_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  systems_involved TEXT[] NOT NULL,
  conflict_type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence JSONB NOT NULL,
  solution_drafted TEXT,
  status TEXT CHECK (status IN ('detected', 'reviewed', 'resolved', 'ignored')) DEFAULT 'detected',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for dashboard queries
CREATE INDEX idx_conflicts_user_status ON cross_system_conflicts(user_id, status);
CREATE INDEX idx_conflicts_severity ON cross_system_conflicts(severity);

-- Synced data (cached for cross-system analysis)
CREATE TABLE connector_sync_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,
  data_type TEXT NOT NULL, -- 'email', 'event', 'document', 'message'
  external_id TEXT NOT NULL, -- ID in external system
  content JSONB NOT NULL,
  extracted_entities JSONB, -- Amounts, dates, people, etc.
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(connector_id, external_id)
);

-- Index for entity extraction queries
CREATE INDEX idx_sync_data_user_connector ON connector_sync_data(user_id, connector_id);
CREATE INDEX idx_sync_data_type ON connector_sync_data(data_type);

-- Workflow patterns (intelligence layer)
CREATE TABLE workflow_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_name TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  systems_required TEXT[] NOT NULL,
  detection_logic JSONB NOT NULL,
  times_detected INTEGER DEFAULT 0,
  success_rate FLOAT DEFAULT 0,
  avg_value_prevented NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track which patterns work best
CREATE INDEX idx_patterns_success ON workflow_patterns(success_rate DESC);
```

---

## **API ROUTES**

### **1. OAuth Flow**

```typescript
// app/api/connectors/[connector_id]/connect/route.ts
import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { connector_id: string } }
) {
  const { connector_id } = params;
  const connector = CONNECTOR_REGISTRY[connector_id];
  
  if (!connector) {
    return NextResponse.json({ error: 'Invalid connector' }, { status: 400 });
  }
  
  // For Google connectors
  if (connector_id.startsWith('google_')) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/connectors/${connector_id}/callback`
    );
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: connector.oauth_scopes,
      prompt: 'consent'
    });
    
    return NextResponse.redirect(authUrl);
  }
  
  // Add other OAuth providers (Slack, Notion, etc.)
}

// app/api/connectors/[connector_id]/callback/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { connector_id: string } }
) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const { connector_id } = params;
  
  if (!code) {
    return NextResponse.redirect('/dashboard?error=oauth_failed');
  }
  
  // Exchange code for tokens
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/connectors/${connector_id}/callback`
  );
  
  const { tokens } = await oauth2Client.getToken(code);
  
  // Store in database
  const { data: { user } } = await supabase.auth.getUser();
  
  await supabase.from('user_connectors').upsert({
    user_id: user.id,
    connector_id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: new Date(tokens.expiry_date),
    last_sync: new Date(),
    sync_status: 'active'
  });
  
  // Trigger immediate sync
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/sync`, {
    method: 'POST',
    body: JSON.stringify({ user_id: user.id, connector_id })
  });
  
  return NextResponse.redirect('/dashboard/connectors?success=true');
}
```

### **2. Sync Engine**

```typescript
// app/api/sync/route.ts
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  const { user_id, connector_id } = await request.json();
  
  // Get connector credentials
  const { data: connector } = await supabase
    .from('user_connectors')
    .select('*')
    .eq('user_id', user_id)
    .eq('connector_id', connector_id)
    .single();
  
  if (!connector) {
    return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
  }
  
  try {
    // Route to appropriate sync handler
    let syncData;
    switch (connector_id) {
      case 'gmail':
        syncData = await syncGmail(connector);
        break;
      case 'google_calendar':
        syncData = await syncCalendar(connector);
        break;
      case 'google_drive':
        syncData = await syncDrive(connector);
        break;
      default:
        throw new Error(`Unknown connector: ${connector_id}`);
    }
    
    // Store synced data
    await storeSyncData(user_id, connector_id, syncData);
    
    // Update last sync
    await supabase
      .from('user_connectors')
      .update({
        last_sync: new Date().toISOString(),
        sync_status: 'active',
        sync_error: null
      })
      .eq('id', connector.id);
    
    // Trigger cross-system conflict detection
    await detectCrossSystemConflicts(user_id);
    
    return NextResponse.json({ success: true, items_synced: syncData.length });
    
  } catch (error) {
    console.error('Sync error:', error);
    
    await supabase
      .from('user_connectors')
      .update({
        sync_status: 'error',
        sync_error: error.message
      })
      .eq('id', connector.id);
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Sync handlers
async function syncGmail(connector: ConnectorData) {
  const gmail = google.gmail({ version: 'v1', auth: getOAuth2Client(connector) });
  
  // Get emails from last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const { data } = await gmail.users.messages.list({
    userId: 'me',
    q: `after:${Math.floor(sevenDaysAgo.getTime() / 1000)}`,
    maxResults: 100
  });
  
  const messages = [];
  for (const message of data.messages || []) {
    const details = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
      format: 'full'
    });
    
    messages.push({
      external_id: message.id,
      data_type: 'email',
      content: parseGmailMessage(details.data),
      extracted_entities: extractEntitiesFromEmail(details.data)
    });
  }
  
  return messages;
}

async function syncCalendar(connector: ConnectorData) {
  const calendar = google.calendar({ version: 'v3', auth: getOAuth2Client(connector) });
  
  // Get events for next 30 days
  const now = new Date();
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
  
  const { data } = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: thirtyDaysLater.toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  });
  
  return (data.items || []).map(event => ({
    external_id: event.id,
    data_type: 'event',
    content: event,
    extracted_entities: extractEntitiesFromEvent(event)
  }));
}

async function syncDrive(connector: ConnectorData) {
  const drive = google.drive({ version: 'v3', auth: getOAuth2Client(connector) });
  
  // Get recently modified files
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const { data } = await drive.files.list({
    q: `modifiedTime > '${sevenDaysAgo.toISOString()}'`,
    fields: 'files(id, name, mimeType, modifiedTime)',
    pageSize: 50
  });
  
  return (data.files || []).map(file => ({
    external_id: file.id,
    data_type: 'document',
    content: file,
    extracted_entities: {} // Expand later
  }));
}
```

### **3. Cross-System Conflict Detection**

```typescript
// lib/conflict-detection/cross-system.ts
export async function detectCrossSystemConflicts(user_id: string) {
  // Get all synced data for user
  const { data: syncedData } = await supabase
    .from('connector_sync_data')
    .select('*')
    .eq('user_id', user_id);
  
  if (!syncedData || syncedData.length === 0) return;
  
  const conflicts = [];
  
  // DETECTION PATTERN 1: Financial Mismatches
  const emailAmounts = extractAmountsFromData(
    syncedData.filter(d => d.connector_id === 'gmail')
  );
  const calendarAmounts = extractAmountsFromData(
    syncedData.filter(d => d.connector_id === 'google_calendar')
  );
  
  for (const emailAmount of emailAmounts) {
    for (const calAmount of calendarAmounts) {
      if (areSimilarContexts(emailAmount.context, calAmount.context)) {
        const diff = Math.abs(emailAmount.value - calAmount.value);
        if (diff > emailAmount.value * 0.1) { // >10% difference
          conflicts.push({
            user_id,
            systems_involved: ['gmail', 'google_calendar'],
            conflict_type: 'FINANCIAL_MISMATCH',
            severity: diff > 50000 ? 'critical' : 'high',
            title: `Budget mismatch: Email vs Calendar`,
            description: `Email mentions $${emailAmount.value.toLocaleString()}, but calendar shows $${calAmount.value.toLocaleString()}`,
            evidence: {
              gmail: emailAmount,
              calendar: calAmount
            },
            solution_drafted: `Draft clarification email: "Hi, I noticed a discrepancy..."`
          });
        }
      }
    }
  }
  
  // DETECTION PATTERN 2: Timeline Conflicts
  const emailDates = extractDatesFromData(
    syncedData.filter(d => d.connector_id === 'gmail')
  );
  const calendarDates = syncedData
    .filter(d => d.connector_id === 'google_calendar')
    .map(d => d.content);
  
  for (const emailDate of emailDates) {
    for (const calEvent of calendarDates) {
      if (areSimilarContexts(emailDate.context, calEvent.summary)) {
        const emailTime = new Date(emailDate.value);
        const calTime = new Date(calEvent.start.dateTime);
        const diffHours = Math.abs(calTime.getTime() - emailTime.getTime()) / 36e5;
        
        if (diffHours > 24) {
          conflicts.push({
            user_id,
            systems_involved: ['gmail', 'google_calendar'],
            conflict_type: 'TIMELINE_CONFLICT',
            severity: 'high',
            title: `Meeting time mismatch`,
            description: `Email says ${emailTime.toLocaleString()}, calendar shows ${calTime.toLocaleString()}`,
            evidence: {
              gmail: emailDate,
              calendar: calEvent
            },
            solution_drafted: `Send calendar update to confirm correct time`
          });
        }
      }
    }
  }
  
  // DETECTION PATTERN 3: Double Bookings
  const calendarEvents = syncedData
    .filter(d => d.connector_id === 'google_calendar')
    .map(d => d.content);
  
  for (let i = 0; i < calendarEvents.length; i++) {
    for (let j = i + 1; j < calendarEvents.length; j++) {
      const event1 = calendarEvents[i];
      const event2 = calendarEvents[j];
      
      if (eventsOverlap(event1, event2)) {
        conflicts.push({
          user_id,
          systems_involved: ['google_calendar'],
          conflict_type: 'DOUBLE_BOOKING',
          severity: 'critical',
          title: `Double-booked: ${event1.summary} vs ${event2.summary}`,
          description: `Both events scheduled at ${event1.start.dateTime}`,
          evidence: {
            event1,
            event2
          },
          solution_drafted: `Reschedule ${event2.summary} to next available slot`
        });
      }
    }
  }
  
  // Store detected conflicts
  for (const conflict of conflicts) {
    await supabase.from('cross_system_conflicts').insert(conflict);
  }
  
  return conflicts;
}

// Helper functions
function extractAmountsFromData(data: any[]) {
  const amounts = [];
  for (const item of data) {
    const text = JSON.stringify(item.content);
    const regex = /\$[\d,]+(?:\.\d{2})?/g;
    const matches = text.match(regex);
    
    if (matches) {
      for (const match of matches) {
        const value = parseFloat(match.replace(/[$,]/g, ''));
        amounts.push({
          value,
          context: extractContext(text, match),
          source: item
        });
      }
    }
  }
  return amounts;
}

function areSimilarContexts(context1: string, context2: string): boolean {
  const words1 = context1.toLowerCase().split(/\s+/);
  const words2 = context2.toLowerCase().split(/\s+/);
  const intersection = words1.filter(w => words2.includes(w));
  return intersection.length / Math.max(words1.length, words2.length) > 0.5;
}

function eventsOverlap(event1: any, event2: any): boolean {
  const start1 = new Date(event1.start.dateTime);
  const end1 = new Date(event1.end.dateTime);
  const start2 = new Date(event2.start.dateTime);
  const end2 = new Date(event2.end.dateTime);
  
  return start1 < end2 && start2 < end1;
}
```

---

## **PRICING INTEGRATION**

```typescript
// lib/billing/connector-limits.ts
export function getConnectorLimits(planName: string) {
  const limits = {
    free: {
      max_connectors: 1, // Only Gmail to show value
      sync_frequency: 'daily'
    },
    professional: {
      max_connectors: Infinity, // UNLIMITED ← The hook
      sync_frequency: 'hourly'
    },
    team: {
      max_connectors: Infinity, // UNLIMITED
      sync_frequency: 'realtime'
    }
  };
  
  return limits[planName] || limits.free;
}

// Enforce in connection flow
export async function canConnectConnector(user_id: string): Promise<boolean> {
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan_name')
    .eq('user_id', user_id)
    .single();
  
  const limits = getConnectorLimits(subscription?.plan_name || 'free');
  
  const { count } = await supabase
    .from('user_connectors')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user_id);
  
  return count < limits.max_connectors;
}
```

---

## **UI COMPONENTS**

### **Dashboard: Connectors Page**

```tsx
// app/dashboard/connectors/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { CONNECTOR_REGISTRY } from '@/lib/connectors/registry';

export default function ConnectorsPage() {
  const [connectedSystems, setConnectedSystems] = useState([]);
  const [plan, setPlan] = useState('free');
  
  useEffect(() => {
    loadConnectors();
  }, []);
  
  async function loadConnectors() {
    const res = await fetch('/api/connectors/list');
    const data = await res.json();
    setConnectedSystems(data.connectors);
    setPlan(data.plan);
  }
  
  function getConnectorStatus(connector_id: string) {
    return connectedSystems.find(c => c.connector_id === connector_id);
  }
  
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Connected Systems</h1>
        <p className="text-gray-600 mt-2">
          Connect your tools to unlock cross-system intelligence
        </p>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-blue-600">
            {connectedSystems.length}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Connected Systems
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-purple-600">
            {conflicts.length}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Conflicts Detected
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-green-600">
            ${totalValuePrevented.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Value Protected
          </div>
        </div>
      </div>
      
      {/* Connector Grid */}
      <div className="grid grid-cols-4 gap-4">
        {Object.values(CONNECTOR_REGISTRY).map(connector => {
          const connected = getConnectorStatus(connector.id);
          const canConnect = plan !== 'free' || connectedSystems.length === 0;
          
          return (
            <div
              key={connector.id}
              className={`bg-white rounded-lg shadow p-6 border-2 ${
                connected ? 'border-green-500' : 'border-gray-200'
              }`}
            >
              <img src={connector.icon} alt={connector.name} className="w-12 h-12 mb-4" />
              <h3 className="font-semibold mb-2">{connector.name}</h3>
              
              {connected ? (
                <div>
                  <div className="flex items-center text-green-600 text-sm mb-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                    Connected
                  </div>
                  <div className="text-xs text-gray-500">
                    Last sync: {new Date(connected.last_sync).toLocaleString()}
                  </div>
                  <button
                    onClick={() => handleDisconnect(connector.id)}
                    className="mt-4 w-full py-2 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div>
                  <div className="text-sm text-gray-500 mb-4">
                    {connector.category}
                  </div>
                  {canConnect ? (
                    <button
                      onClick={() => handleConnect(connector.id)}
                      className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Connect
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push('/pricing')}
                      className="w-full py-2 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                    >
                      Upgrade to Connect
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Cross-System Intelligence */}
      {connectedSystems.length > 1 && (
        <div className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">
            🧠 Cross-System Intelligence Active
          </h3>
          <p className="text-gray-700">
            Foldera is monitoring {connectedSystems.length} systems for conflicts.
            Last conflict detected: {lastConflict}
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## **SUCCESS METRICS TO TRACK**

```typescript
// lib/analytics/connector-metrics.ts
export interface ConnectorMetrics {
  avg_connectors_per_user: number; // Target: 7+
  connector_retention_by_count: Record<number, number>; // More = stickier
  cross_system_conflicts_found: number; // Proves value
  most_valuable_combinations: Array<{
    connectors: string[];
    avg_conflicts_found: number;
    avg_value_prevented: number;
  }>;
  time_to_nth_connector: Record<number, number>; // How fast they add more
}

// Track in dashboard
export async function trackConnectorMetrics() {
  const metrics = await calculateMetrics();
  
  console.log('Connector Intelligence Metrics:', {
    total_users: metrics.total_users,
    avg_connectors: metrics.avg_connectors_per_user,
    most_connected: metrics.most_valuable_combinations[0],
    fastest_adoption: `${metrics.time_to_nth_connector[3]} days to 3rd connector`
  });
}
```

---

## **BUILD ORDER**

### **Week 1: Core Infrastructure**
1. ✅ Database schema deployment
2. ✅ OAuth flow for Google (Gmail, Calendar, Drive)
3. ✅ Basic sync engine
4. ✅ Connectors dashboard UI

### **Week 2: Intelligence Layer**
1. ✅ Cross-system conflict detection (financial, timeline)
2. ✅ Conflict dashboard
3. ✅ One-click approval integration
4. ✅ Metrics tracking

### **Week 3: Expansion**
1. ✅ Add Slack connector
2. ✅ Add Notion connector
3. ✅ Add Salesforce connector
4. ✅ Pricing enforcement (1 connector free, unlimited paid)

### **Week 4: Polish & Launch**
1. ✅ Error handling & retry logic
2. ✅ Token refresh automation
3. ✅ Onboarding flow
4. ✅ Marketing materials

---

## **CRITICAL SUCCESS FACTORS**

### **1. Cross-System Detection Is The Product**
Don't just sync data. Find where systems DISAGREE.

### **2. Unlimited Connectors = Growth Hack**
Every connector makes Foldera more valuable. Don't limit it.

### **3. One-Click Approval Stays**
Even with automation, user must approve. Trust is the moat.

### **4. Track Connector Combinations**
Which pairs/trios find the most conflicts? Double down there.

---

## **ENVIRONMENT VARIABLES NEEDED**

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

# Slack OAuth (Week 3)
SLACK_CLIENT_ID=your_slack_id
SLACK_CLIENT_SECRET=your_slack_secret

# Notion OAuth (Week 3)
NOTION_CLIENT_ID=your_notion_id
NOTION_CLIENT_SECRET=your_notion_secret

# Salesforce OAuth (Week 3)
SALESFORCE_CLIENT_ID=your_sf_id
SALESFORCE_CLIENT_SECRET=your_sf_secret

# Base URL for OAuth callbacks
NEXT_PUBLIC_BASE_URL=https://foldera.ai
```

---

## **READY TO SHIP?**

**Feed this entire document to Cursor with:**

> "Build the Connector Intelligence System exactly as specified in CURSOR_IMPLEMENTATION_BRIEF.md. Start with Week 1 tasks: Database schema, Google OAuth, and basic sync engine. Ask questions if anything is unclear."

**This is executable. Ship it.** 🚀
