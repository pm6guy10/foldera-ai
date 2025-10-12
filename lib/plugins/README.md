# 🔌 Foldera Plugin System

## Overview

The Foldera AI Chief of Staff uses a plugin architecture to integrate with multiple data sources (Gmail, Drive, Slack, Calendar, Asana, Notion, etc.).

**Key Principle:** The core intelligence engine is **100% source-agnostic**. All plugins convert their data to a universal `WorkItem` format that the AI can analyze uniformly.

---

## Architecture

```
┌─────────────────────────────────────┐
│   Intelligence Engine                │
│   - Analyzes WorkItems from any source
│   - Detects problems (universal)    │
│   - Generates drafts                 │
│   - Builds knowledge graph           │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      Plugin System                   │
│   - Standard interface               │
│   - Easy to add new sources          │
└─────────────────────────────────────┘
              ↓
    ┌─────┬─────┬─────┬─────┐
    │Gmail│Drive│Slack│ ... │
    └─────┴─────┴─────┴─────┘
```

---

## Plugin Interface

All plugins must implement this interface:

```typescript
interface Plugin {
  // Metadata
  name: string;
  displayName: string;
  version: string;
  description: string;
  icon?: string;
  
  // Core methods
  initialize(userId: string, credentials: PluginCredentials): Promise<void>;
  scan(since?: Date, cursor?: string): Promise<ScanResult>;
  execute(action: DraftAction): Promise<ExecutionResult>;
  isHealthy(): Promise<boolean>;
  
  // Optional
  refreshCredentials?(): Promise<PluginCredentials>;
  getSettingsSchema?(): Record<string, any>;
}
```

---

## Gmail Plugin (Reference Implementation)

The Gmail plugin serves as the reference for all future plugins.

### File Structure

```
/lib/plugins/gmail/
├── index.ts           # Main plugin implementation
├── scanner.ts         # Fetches emails from Gmail API
├── parser.ts          # Converts emails to WorkItems
├── sender.ts          # Sends drafted emails
└── __tests__/
    └── gmail-plugin.test.ts
```

### Key Components

**Scanner** (`scanner.ts`)
- Fetches raw data from external API
- Handles pagination, rate limits, errors
- Returns source-specific data format

**Parser** (`parser.ts`)
- Converts source-specific format to universal `WorkItem`
- Extracts relationships between items
- Cleans/normalizes content for AI

**Sender** (`sender.ts`) *if applicable*
- Executes draft actions approved by user
- Sends emails, updates docs, posts messages, etc.

---

## Adding a New Plugin

### Step 1: Create Plugin Folder

```bash
mkdir -p lib/plugins/[plugin-name]
cd lib/plugins/[plugin-name]
```

### Step 2: Implement Scanner

Create `scanner.ts`:

```typescript
import { [ExternalAPI] } from '[package]';

export class [PluginName]Scanner {
  private client: [ExternalAPI] | null = null;
  private userId: string;
  
  constructor(userId: string, credentials: PluginCredentials) {
    this.userId = userId;
    this.initializeClient(credentials);
  }
  
  private initializeClient(credentials: PluginCredentials): void {
    // Set up API client with OAuth tokens or API keys
  }
  
  async fetch[Items](since?: Date): Promise<[RawItem][]> {
    // Fetch items from external API
    // Handle pagination
    // Handle errors
    // Return raw items
  }
  
  async testConnection(): Promise<boolean> {
    // Verify API is reachable
  }
}
```

### Step 3: Implement Parser

Create `parser.ts`:

```typescript
import type { WorkItem } from '@/lib/types/work-item';

export class [PluginName]Parser {
  [itemType]ToWorkItem(rawItem: [RawItem]): WorkItem {
    return {
      id: rawItem.id,
      source: '[plugin-name]',
      type: '[item-type]', // e.g., 'document', 'message', 'task'
      
      timestamp: new Date(rawItem.createdAt),
      author: rawItem.author,
      title: rawItem.title || rawItem.name,
      content: this.cleanContent(rawItem.content),
      
      metadata: {
        // Plugin-specific metadata
        // Include anything the intelligence engine might need
      },
      
      relationships: this.extractRelationships(rawItem),
      
      createdAt: new Date(rawItem.createdAt),
      fetchedAt: new Date(),
    };
  }
  
  private cleanContent(content: string): string {
    // Remove formatting, excessive whitespace
    // Limit length for AI processing
  }
  
  private extractRelationships(rawItem: [RawItem]): WorkItemRelationship[] {
    // Build relationships to other items
    // Examples: replies_to, references, depends_on, etc.
  }
}
```

### Step 4: Implement Sender (if applicable)

Create `sender.ts` (only if plugin supports actions):

```typescript
import type { DraftAction, ExecutionResult } from '@/lib/types/work-item';

export class [PluginName]Sender {
  async execute[Action](draft: DraftAction): Promise<ExecutionResult> {
    // Execute the approved action
    // Examples:
    // - Send email (Gmail)
    // - Update document (Drive)
    // - Post message (Slack)
    // - Update task (Asana)
    
    return {
      success: true,
      executedAt: new Date(),
      itemId: '[created-item-id]',
      itemSource: '[plugin-name]',
    };
  }
}
```

### Step 5: Implement Main Plugin

Create `index.ts`:

```typescript
import type { Plugin } from '../plugin-interface';
import type { PluginCredentials, ScanResult, ExecutionResult, DraftAction } from '@/lib/types/work-item';
import { [PluginName]Scanner } from './scanner';
import { [PluginName]Parser } from './parser';
import { [PluginName]Sender } from './sender';

export class [PluginName]Plugin implements Plugin {
  name = '[plugin-name]';
  displayName = '[Plugin Display Name]';
  version = '1.0.0';
  description = '[Brief description]';
  icon = '[emoji]';
  
  private scanner: [PluginName]Scanner | null = null;
  private parser: [PluginName]Parser | null = null;
  private sender: [PluginName]Sender | null = null;
  
  async initialize(userId: string, credentials: PluginCredentials): Promise<void> {
    this.scanner = new [PluginName]Scanner(userId, credentials);
    this.parser = new [PluginName]Parser();
    this.sender = new [PluginName]Sender(userId, credentials);
    
    // Test connection
    const isConnected = await this.scanner.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to [Plugin Name] API');
    }
  }
  
  async scan(since?: Date, cursor?: string): Promise<ScanResult> {
    const startTime = Date.now();
    
    // Fetch raw items
    const rawItems = await this.scanner.fetch[Items](since);
    
    // Convert to WorkItems
    const workItems = rawItems.map(item => 
      this.parser.[itemType]ToWorkItem(item)
    );
    
    return {
      success: true,
      items: workItems,
      itemCount: workItems.length,
      hasMore: false,
      scannedAt: new Date(),
      durationMs: Date.now() - startTime,
    };
  }
  
  async execute(action: DraftAction): Promise<ExecutionResult> {
    if (action.targetSource !== this.name) {
      throw new Error(`Invalid target source: ${action.targetSource}`);
    }
    
    return await this.sender.execute[Action](action);
  }
  
  async isHealthy(): Promise<boolean> {
    return await this.scanner.testConnection();
  }
}

export function create[PluginName]Plugin(): Plugin {
  return new [PluginName]Plugin();
}

export const [pluginName]Metadata = {
  name: '[plugin-name]',
  displayName: '[Plugin Display Name]',
  description: '[Description]',
  version: '1.0.0',
  icon: '[emoji]',
  category: '[communication|storage|project|crm|finance|other]',
  // OAuth or API key configuration
};
```

### Step 6: Add Tests

Create `__tests__/[plugin-name].test.ts`:

```typescript
import { [PluginName]Plugin } from '../index';

async function testPlugin() {
  const plugin = new [PluginName]Plugin();
  
  await plugin.initialize('test-user', mockCredentials);
  const scanResult = await plugin.scan();
  const isHealthy = await plugin.isHealthy();
  
  console.log(`Scanned ${scanResult.itemCount} items`);
  console.log(`Plugin healthy: ${isHealthy}`);
}

testPlugin();
```

### Step 7: Register Plugin

Add to `plugin-registry.ts`:

```typescript
import { create[PluginName]Plugin, [pluginName]Metadata } from './[plugin-name]';

export const PLUGIN_REGISTRY = [
  // ... existing plugins
  {
    metadata: [pluginName]Metadata,
    factory: create[PluginName]Plugin,
  },
];
```

---

## Example: Slack Plugin (Template)

Here's how you'd add a Slack plugin:

### scanner.ts

```typescript
import { WebClient } from '@slack/web-api';

export class SlackScanner {
  private client: WebClient;
  
  constructor(userId: string, credentials: PluginCredentials) {
    this.client = new WebClient(credentials.accessToken);
  }
  
  async fetchMessages(since?: Date): Promise<SlackMessage[]> {
    const channels = await this.client.conversations.list();
    const messages: SlackMessage[] = [];
    
    for (const channel of channels.channels || []) {
      const history = await this.client.conversations.history({
        channel: channel.id!,
        oldest: since ? String(since.getTime() / 1000) : undefined,
      });
      
      messages.push(...(history.messages || []));
    }
    
    return messages;
  }
}
```

### parser.ts

```typescript
export class SlackParser {
  messageToWorkItem(message: SlackMessage): WorkItem {
    return {
      id: message.ts,
      source: 'slack',
      type: 'message',
      
      timestamp: new Date(parseFloat(message.ts) * 1000),
      author: message.user,
      content: message.text || '',
      
      metadata: {
        channel: message.channel,
        channelType: message.channel_type,
        thread: message.thread_ts,
        reactions: message.reactions,
        isThreadReply: !!message.thread_ts && message.thread_ts !== message.ts,
      },
      
      relationships: message.thread_ts && message.thread_ts !== message.ts
        ? [{
            targetId: message.thread_ts,
            targetSource: 'slack',
            relationType: 'replies_to',
          }]
        : [],
      
      createdAt: new Date(parseFloat(message.ts) * 1000),
      fetchedAt: new Date(),
    };
  }
}
```

### sender.ts

```typescript
export class SlackSender {
  async sendMessage(draft: DraftAction): Promise<ExecutionResult> {
    const result = await this.client.chat.postMessage({
      channel: draft.metadata.channel,
      text: draft.draft,
      thread_ts: draft.metadata.threadId,
    });
    
    return {
      success: result.ok,
      executedAt: new Date(),
      itemId: result.ts,
      itemSource: 'slack',
    };
  }
}
```

---

## Plugin Development Checklist

- [ ] Created plugin folder
- [ ] Implemented scanner (fetch data)
- [ ] Implemented parser (convert to WorkItem)
- [ ] Implemented sender (if supports actions)
- [ ] Implemented main plugin class
- [ ] Added comprehensive tests
- [ ] Registered in plugin-registry.ts
- [ ] Documented OAuth/API requirements
- [ ] Added error handling
- [ ] Added rate limiting
- [ ] Added health check
- [ ] Tested end-to-end

---

## Best Practices

### 1. Keep Intelligence Engine Agnostic

**DO:**
- Convert everything to WorkItem format
- Include rich metadata for AI analysis
- Build relationships between items

**DON'T:**
- Add source-specific logic to intelligence engine
- Make assumptions about data format
- Skip metadata that might be useful

### 2. Handle Errors Gracefully

```typescript
try {
  const items = await scanner.fetchItems();
} catch (error) {
  if (error.code === 401) {
    // Token expired - trigger re-auth
  } else if (error.code === 429) {
    // Rate limited - backoff
  } else {
    // Other error - log and continue
  }
}
```

### 3. Optimize for Performance

- Use batch API requests when possible
- Implement pagination for large datasets
- Cache frequently accessed data
- Only fetch what's needed (incremental sync)

### 4. Security

- Never log credentials or tokens
- Encrypt credentials at rest
- Use secure token storage
- Validate all user inputs

---

## Testing Your Plugin

```bash
# Run plugin tests
cd lib/plugins/[plugin-name]
ts-node __tests__/[plugin-name].test.ts

# Test with real credentials (careful!)
PLUGIN_TEST_USER_ID=test-user \
PLUGIN_TEST_ACCESS_TOKEN=your-token \
npm run test:plugin:[plugin-name]
```

---

## Plugin Registry

Once your plugin is complete, users can enable it via:

1. **Dashboard UI:** Settings → Integrations → Enable [Plugin Name]
2. **API:** `POST /api/plugins/enable` with `{pluginName: '[plugin-name]'}`

The system will:
1. Redirect user to OAuth flow (if needed)
2. Store credentials securely
3. Call `plugin.initialize()`
4. Begin scanning on next cron cycle

---

## Support

Questions about plugin development?

1. Review Gmail plugin as reference
2. Check types in `/lib/types/work-item.ts`
3. Test with mock data first
4. Ask in #engineering-plugins Slack channel

---

**Built with ❤️ by the Foldera team**

