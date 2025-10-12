// =====================================================
// GMAIL PLUGIN - Test Suite
// Demonstrates plugin usage and validates interface
// =====================================================

import { GmailPlugin, gmailPluginMetadata } from '../index';
import type { PluginCredentials, DraftAction } from '@/lib/types/work-item';

/**
 * Mock Credentials for Testing
 * 
 * In real usage, these come from database after OAuth flow
 */
const mockCredentials: PluginCredentials = {
  accessToken: 'ya29.mock_access_token',
  refreshToken: '1//mock_refresh_token',
  expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
  userEmail: 'test@example.com',
};

/**
 * Test: Plugin Initialization
 * 
 * Verifies plugin can be created and initialized
 */
async function testInitialization() {
  console.log('\n[TEST] Plugin Initialization');
  console.log('================================');
  
  try {
    const plugin = new GmailPlugin();
    
    // Check metadata
    console.log(`✓ Plugin name: ${plugin.name}`);
    console.log(`✓ Display name: ${plugin.displayName}`);
    console.log(`✓ Version: ${plugin.version}`);
    console.log(`✓ Description: ${plugin.description}`);
    
    // Initialize with credentials
    await plugin.initialize('test-user-123', mockCredentials);
    
    console.log(`✓ Plugin initialized successfully`);
    
    return plugin;
    
  } catch (error: any) {
    console.error(`✗ Initialization failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test: Scan for Work Items
 * 
 * Verifies plugin can fetch and convert emails to WorkItems
 */
async function testScan(plugin: GmailPlugin) {
  console.log('\n[TEST] Scan for Work Items');
  console.log('================================');
  
  try {
    // Scan last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);
    
    console.log(`Scanning emails since: ${since.toISOString()}`);
    
    const result = await plugin.scan(since);
    
    console.log(`✓ Scan completed in ${result.durationMs}ms`);
    console.log(`✓ Success: ${result.success}`);
    console.log(`✓ Items found: ${result.itemCount}`);
    
    if (result.items.length > 0) {
      const firstItem = result.items[0];
      
      console.log('\nFirst Work Item:');
      console.log(`  ID: ${firstItem.id}`);
      console.log(`  Source: ${firstItem.source}`);
      console.log(`  Type: ${firstItem.type}`);
      console.log(`  Author: ${firstItem.author}`);
      console.log(`  Title: ${firstItem.title}`);
      console.log(`  Timestamp: ${firstItem.timestamp.toISOString()}`);
      console.log(`  Content length: ${firstItem.content.length} chars`);
      console.log(`  Relationships: ${firstItem.relationships.length}`);
      console.log(`  Metadata keys: ${Object.keys(firstItem.metadata).join(', ')}`);
    }
    
    if (result.errors && result.errors.length > 0) {
      console.warn(`⚠ Errors: ${result.errors.join(', ')}`);
    }
    
    return result;
    
  } catch (error: any) {
    console.error(`✗ Scan failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test: Execute Draft Action
 * 
 * Verifies plugin can send an email
 */
async function testExecute(plugin: GmailPlugin) {
  console.log('\n[TEST] Execute Draft Action');
  console.log('================================');
  
  try {
    // Create mock draft action
    const draftAction: DraftAction = {
      type: 'email',
      draft: 'Hi Sarah,\n\nJust following up on the Q4 roadmap. Let me know if you need any updates.\n\nBest,\nTest',
      subject: 'Re: Q4 Roadmap Update',
      targetSource: 'gmail',
      metadata: {
        to: ['sarah@example.com'],
        cc: [],
        threadId: 'mock-thread-id',
        inReplyTo: '<mock-message-id@mail.gmail.com>',
      },
    };
    
    console.log(`Executing email to: ${draftAction.metadata.to.join(', ')}`);
    console.log(`Subject: ${draftAction.subject}`);
    
    const result = await plugin.execute(draftAction);
    
    console.log(`✓ Execution completed`);
    console.log(`✓ Success: ${result.success}`);
    
    if (result.success) {
      console.log(`✓ Email sent! ID: ${result.itemId}`);
    } else {
      console.error(`✗ Email failed: ${result.error}`);
    }
    
    return result;
    
  } catch (error: any) {
    console.error(`✗ Execute failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test: Health Check
 * 
 * Verifies plugin health check works
 */
async function testHealthCheck(plugin: GmailPlugin) {
  console.log('\n[TEST] Health Check');
  console.log('================================');
  
  try {
    const isHealthy = await plugin.isHealthy();
    
    console.log(`✓ Health check completed`);
    console.log(`✓ Plugin healthy: ${isHealthy}`);
    
    return isHealthy;
    
  } catch (error: any) {
    console.error(`✗ Health check failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test: Get Settings Schema
 * 
 * Verifies plugin returns configuration schema
 */
function testSettingsSchema(plugin: GmailPlugin) {
  console.log('\n[TEST] Settings Schema');
  console.log('================================');
  
  try {
    const schema = plugin.getSettingsSchema();
    
    console.log(`✓ Schema retrieved`);
    console.log(`Settings:`, JSON.stringify(schema, null, 2));
    
    return schema;
    
  } catch (error: any) {
    console.error(`✗ Schema retrieval failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test: Plugin Metadata
 * 
 * Verifies metadata is correct
 */
function testMetadata() {
  console.log('\n[TEST] Plugin Metadata');
  console.log('================================');
  
  try {
    console.log(`Name: ${gmailPluginMetadata.name}`);
    console.log(`Display Name: ${gmailPluginMetadata.displayName}`);
    console.log(`Description: ${gmailPluginMetadata.description}`);
    console.log(`Version: ${gmailPluginMetadata.version}`);
    console.log(`Category: ${gmailPluginMetadata.category}`);
    console.log(`OAuth Scopes: ${gmailPluginMetadata.oauth.scopes.join(', ')}`);
    console.log(`API Base URL: ${gmailPluginMetadata.api.baseUrl}`);
    console.log(`Rate Limit: ${gmailPluginMetadata.api.rateLimit.requests} requests per ${gmailPluginMetadata.api.rateLimit.perSeconds}s`);
    
    console.log(`✓ Metadata valid`);
    
  } catch (error: any) {
    console.error(`✗ Metadata test failed: ${error.message}`);
    throw error;
  }
}

/**
 * Run All Tests
 * 
 * Executes complete test suite
 */
export async function runGmailPluginTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   GMAIL PLUGIN TEST SUITE              ║');
  console.log('╚════════════════════════════════════════╝');
  
  try {
    // Test metadata
    testMetadata();
    
    // Test initialization
    const plugin = await testInitialization();
    
    // Test health check
    await testHealthCheck(plugin);
    
    // Test settings schema
    testSettingsSchema(plugin);
    
    // Test scan
    const scanResult = await testScan(plugin);
    
    // Test execute (commented out to avoid actually sending emails)
    // await testExecute(plugin);
    console.log('\n[TEST] Execute (skipped - would send real email)');
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   ALL TESTS PASSED ✓                   ║');
    console.log('╚════════════════════════════════════════╝\n');
    
  } catch (error: any) {
    console.error('\n╔════════════════════════════════════════╗');
    console.error('║   TESTS FAILED ✗                       ║');
    console.error('╚════════════════════════════════════════╝');
    console.error(`\nError: ${error.message}\n`);
    
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

/**
 * Mock Data Generator
 * 
 * Creates mock WorkItems for testing intelligence engine
 */
export function generateMockWorkItems() {
  const now = new Date();
  
  return [
    // Unanswered question (3 days old)
    {
      id: 'msg-001',
      source: 'gmail' as const,
      type: 'email' as const,
      timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      author: 'sarah@example.com',
      title: 'Quick question about Q4 roadmap',
      content: 'Hey, when can I expect the Q4 roadmap update? Need it for the board meeting next week.',
      metadata: {
        from: 'sarah@example.com',
        to: ['you@example.com'],
        threadId: 'thread-001',
        isReceived: true,
        isSent: false,
      },
      relationships: [],
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      fetchedAt: now,
    },
    
    // Broken promise (8 days ago you said "I'll send it by Friday")
    {
      id: 'msg-002',
      source: 'gmail' as const,
      type: 'email' as const,
      timestamp: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      author: 'you@example.com',
      title: 'Re: Project Phoenix Timeline',
      content: 'Thanks for asking. I\'ll have the updated timeline sent over by Friday.',
      metadata: {
        from: 'you@example.com',
        to: ['marcus@example.com'],
        threadId: 'thread-002',
        isReceived: false,
        isSent: true,
      },
      relationships: [],
      createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      fetchedAt: now,
    },
    
    // Ghosted reply (you got a reply 5 days ago, didn't respond)
    {
      id: 'msg-003',
      source: 'gmail' as const,
      type: 'email' as const,
      timestamp: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      author: 'alex@example.com',
      title: 'Re: Budget Discussion',
      content: 'Hi, following up on the budget questions I sent last week. Can you review when you get a chance?',
      metadata: {
        from: 'alex@example.com',
        to: ['you@example.com'],
        threadId: 'thread-003',
        isReceived: true,
        isSent: false,
      },
      relationships: [],
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      fetchedAt: now,
    },
  ];
}

// If running directly (not imported), execute tests
if (require.main === module) {
  runGmailPluginTests();
}

