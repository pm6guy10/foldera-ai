// =====================================================
// FOLDERA AI CHIEF OF STAFF - Plugin Interface
// Standard contract all plugins must implement
// =====================================================

import type { 
  WorkItem, 
  DraftAction, 
  ScanResult, 
  ExecutionResult,
  PluginCredentials 
} from '@/lib/types/work-item';

/**
 * Plugin Interface
 * 
 * All plugins (Gmail, Drive, Slack, etc.) must implement this interface.
 * This ensures consistent behavior across all integrations.
 * 
 * PLUGIN LIFECYCLE:
 * 1. User enables plugin in dashboard
 * 2. initialize() called with credentials
 * 3. scan() called periodically to fetch new items
 * 4. execute() called when user approves a draft action
 * 5. isHealthy() checked before operations
 * 
 * ADDING A NEW PLUGIN:
 * 1. Create folder: /lib/plugins/[plugin-name]/
 * 2. Implement this interface in index.ts
 * 3. Register in plugin-registry.ts
 * 4. Add to database: INSERT INTO plugins (name, version, ...)
 */
export interface Plugin {
  // Plugin metadata
  name: string;                    // Unique plugin identifier (e.g., 'gmail')
  displayName: string;             // Human-readable name (e.g., 'Gmail')
  version: string;                 // Semantic version (e.g., '1.0.0')
  description: string;             // Brief description
  icon?: string;                   // Icon URL or emoji
  
  /**
   * Initialize Plugin
   * 
   * Called once when user enables the plugin.
   * Set up API clients, validate credentials, etc.
   * 
   * @param userId - User ID from database
   * @param credentials - Auth tokens/keys (encrypted in DB)
   * @throws Error if initialization fails
   */
  initialize(userId: string, credentials: PluginCredentials): Promise<void>;
  
  /**
   * Scan for New Work Items
   * 
   * Fetch new items since last sync.
   * Convert them to universal WorkItem format.
   * 
   * IMPORTANT:
   * - Return ONLY items since 'since' date
   * - Each item must have unique ID within source
   * - Set relationships between items if applicable
   * - Include rich metadata for intelligence engine
   * 
   * @param since - Fetch items modified after this date (optional)
   * @param cursor - Pagination cursor for large datasets (optional)
   * @returns ScanResult with WorkItems
   */
  scan(since?: Date, cursor?: string): Promise<ScanResult>;
  
  /**
   * Execute Draft Action
   * 
   * Take an action approved by user and execute it.
   * Examples:
   * - Send email (Gmail)
   * - Update document (Drive)
   * - Post message (Slack)
   * 
   * @param action - The draft action to execute
   * @returns ExecutionResult with success/error
   */
  execute(action: DraftAction): Promise<ExecutionResult>;
  
  /**
   * Health Check
   * 
   * Verify plugin is working properly.
   * Check:
   * - Credentials are valid (not expired)
   * - API is reachable
   * - Required scopes/permissions granted
   * 
   * @returns true if healthy, false otherwise
   */
  isHealthy(): Promise<boolean>;
  
  /**
   * Refresh Credentials (Optional)
   * 
   * For OAuth plugins, refresh access token using refresh token.
   * Called automatically when access token expires.
   * 
   * @returns New credentials
   */
  refreshCredentials?(): Promise<PluginCredentials>;
  
  /**
   * Get Configuration Schema (Optional)
   * 
   * Return schema for plugin-specific settings.
   * Used to render settings UI in dashboard.
   * 
   * @returns JSON schema for settings
   */
  getSettingsSchema?(): Record<string, any>;
}

/**
 * Plugin Factory
 * 
 * Function that creates a plugin instance.
 * Used by plugin registry to instantiate plugins.
 */
export type PluginFactory = () => Plugin;

/**
 * Plugin Metadata
 * 
 * Information about a plugin for the registry
 */
export interface PluginMetadata {
  name: string;
  displayName: string;
  description: string;
  version: string;
  icon?: string;
  category: 'communication' | 'storage' | 'project' | 'crm' | 'finance' | 'other';
  
  // OAuth configuration
  oauth?: {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    clientId?: string;
  };
  
  // API requirements
  api?: {
    baseUrl: string;
    rateLimit?: {
      requests: number;
      perSeconds: number;
    };
  };
}

/**
 * Plugin Error
 * 
 * Standard error format for plugins
 */
export class PluginError extends Error {
  constructor(
    public pluginName: string,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(`[${pluginName}] ${message}`);
    this.name = 'PluginError';
  }
}

/**
 * Common Error Codes
 */
export enum PluginErrorCode {
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_INVALID = 'AUTH_INVALID',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  SCAN_FAILED = 'SCAN_FAILED',
}

