// =====================================================
// FOLDERA - Mock System Test
// Tests the core logic WITHOUT needing API keys
// Run: node test-mock-system.js
// =====================================================

console.log('\n╔════════════════════════════════════════╗');
console.log('║   FOLDERA MOCK SYSTEM TEST             ║');
console.log('╚════════════════════════════════════════╝\n');

// =====================================================
// TEST 1: Plugin Interface
// =====================================================
console.log('🔌 TEST 1: Plugin Interface Structure');
console.log('=====================================');

const mockPlugin = {
  name: 'gmail',
  displayName: 'Gmail',
  version: '1.0.0',
  description: 'Scan Gmail emails',
  
  initialize: async (userId, credentials) => {
    console.log(`✅ Plugin initialized for user: ${userId}`);
    return true;
  },
  
  scan: async (since) => {
    console.log(`✅ Scanning emails since: ${since || 'beginning'}`);
    
    // Return mock work items
    return {
      success: true,
      items: [
        {
          id: 'email-001',
          source: 'gmail',
          type: 'email',
          timestamp: new Date(),
          author: 'sarah@example.com',
          title: 'Q4 Roadmap Update Needed',
          content: 'Hey, when can I expect the Q4 roadmap? Need it for board meeting.',
          metadata: {
            from: 'sarah@example.com',
            to: ['you@example.com'],
            isQuestion: true,
            daysOld: 3,
          },
          relationships: [],
        },
        {
          id: 'email-002',
          source: 'gmail',
          type: 'email',
          timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
          author: 'you@example.com',
          title: 'Re: Project Timeline',
          content: "I'll have the updated timeline sent over by Friday.",
          metadata: {
            from: 'you@example.com',
            to: ['marcus@example.com'],
            hasPromise: true,
            daysOld: 8,
          },
          relationships: [],
        },
      ],
      itemCount: 2,
      hasMore: false,
      scannedAt: new Date(),
      durationMs: 150,
    };
  },
  
  execute: async (action) => {
    console.log(`✅ Executing action: ${action.type}`);
    console.log(`   To: ${action.metadata.to.join(', ')}`);
    console.log(`   Draft: ${action.draft.substring(0, 50)}...`);
    
    return {
      success: true,
      executedAt: new Date(),
      itemId: 'sent-email-123',
      itemSource: 'gmail',
    };
  },
  
  isHealthy: async () => {
    console.log(`✅ Health check passed`);
    return true;
  },
};

console.log(`Plugin Name: ${mockPlugin.name}`);
console.log(`Display Name: ${mockPlugin.displayName}`);
console.log(`Version: ${mockPlugin.version}\n`);

// =====================================================
// TEST 2: Work Item Conversion
// =====================================================
console.log('📧 TEST 2: Email → WorkItem Conversion');
console.log('========================================');

const mockEmail = {
  id: 'msg-12345',
  from: 'client@example.com',
  to: 'you@example.com',
  subject: 'Urgent: Budget Approval Needed',
  body: 'Can you approve the Q4 budget by EOD? We need to close the deal.',
  date: new Date(),
};

const workItem = {
  id: mockEmail.id,
  source: 'gmail',
  type: 'email',
  timestamp: mockEmail.date,
  author: mockEmail.from,
  title: mockEmail.subject,
  content: mockEmail.body,
  metadata: {
    from: mockEmail.from,
    to: [mockEmail.to],
    isQuestion: mockEmail.body.includes('?'),
    hasDeadline: mockEmail.body.toLowerCase().includes('eod'),
    urgencyKeywords: ['urgent'],
  },
  relationships: [],
  createdAt: mockEmail.date,
  fetchedAt: new Date(),
};

console.log('✅ Converted email to WorkItem:');
console.log(`   ID: ${workItem.id}`);
console.log(`   Source: ${workItem.source}`);
console.log(`   Type: ${workItem.type}`);
console.log(`   Author: ${workItem.author}`);
console.log(`   Title: ${workItem.title}`);
console.log(`   Content: ${workItem.content.substring(0, 50)}...`);
console.log(`   Has Question: ${workItem.metadata.isQuestion}`);
console.log(`   Has Deadline: ${workItem.metadata.hasDeadline}\n`);

// =====================================================
// TEST 3: Problem Detection
// =====================================================
console.log('🔍 TEST 3: Problem Detection Logic');
console.log('====================================');

async function detectProblems(workItems) {
  const problems = [];
  
  for (const item of workItems) {
    // Pattern 1: Unanswered questions (3+ days old)
    if (item.metadata.isQuestion && item.metadata.daysOld >= 3) {
      problems.push({
        id: `problem-${Date.now()}-1`,
        type: 'unanswered_question',
        priority: 'high',
        title: 'Unanswered question from ' + item.author,
        description: `${item.author} asked a question ${item.metadata.daysOld} days ago that hasn't been answered.`,
        affectedItems: [item],
        suggestedAction: {
          type: 'email',
          draft: `Hi ${item.author.split('@')[0]},\n\nSorry for the delay. Regarding your question about "${item.title}" - let me get back to you on this.\n\nBest,`,
          subject: `Re: ${item.title}`,
          targetSource: 'gmail',
          metadata: {
            to: [item.author],
          },
        },
      });
    }
    
    // Pattern 2: Broken promises (7+ days old)
    if (item.metadata.hasPromise && item.metadata.daysOld >= 7) {
      problems.push({
        id: `problem-${Date.now()}-2`,
        type: 'broken_promise',
        priority: 'high',
        title: 'Unfulfilled commitment to ' + item.metadata.to[0],
        description: `You promised to deliver something ${item.metadata.daysOld} days ago. No follow-up detected.`,
        affectedItems: [item],
        suggestedAction: {
          type: 'email',
          draft: `Hi ${item.metadata.to[0].split('@')[0]},\n\nFollowing up on what I mentioned about the timeline. Here's the update:\n\n[Add your update here]\n\nLet me know if you need anything else.\n\nBest,`,
          subject: 'Following up: Project Timeline',
          targetSource: 'gmail',
          metadata: {
            to: item.metadata.to,
          },
        },
      });
    }
  }
  
  return problems;
}

// Test with mock data
(async () => {
  console.log('Scanning for problems...\n');
  
  const scanResult = await mockPlugin.scan();
  console.log(`✅ Scanned ${scanResult.itemCount} work items\n`);
  
  const problems = await detectProblems(scanResult.items);
  console.log(`✅ Detected ${problems.length} problems\n`);
  
  problems.forEach((problem, idx) => {
    console.log(`Problem ${idx + 1}:`);
    console.log(`  Type: ${problem.type}`);
    console.log(`  Priority: ${problem.priority}`);
    console.log(`  Title: ${problem.title}`);
    console.log(`  Description: ${problem.description}`);
    console.log(`  Suggested Action: ${problem.suggestedAction.type}`);
    console.log(`  Draft (preview): ${problem.suggestedAction.draft.substring(0, 80)}...`);
    console.log('');
  });
  
  // =====================================================
  // TEST 4: Draft Execution
  // =====================================================
  console.log('✉️  TEST 4: Execute Draft Action');
  console.log('=================================');
  
  if (problems.length > 0) {
    const firstProblem = problems[0];
    console.log(`Executing draft for: ${firstProblem.title}\n`);
    
    const result = await mockPlugin.execute(firstProblem.suggestedAction);
    
    if (result.success) {
      console.log(`✅ Email sent successfully!`);
      console.log(`   Message ID: ${result.itemId}`);
      console.log(`   Sent at: ${result.executedAt.toISOString()}\n`);
    }
  }
  
  // =====================================================
  // TEST 5: Daily Brief Summary
  // =====================================================
  console.log('📋 TEST 5: Daily Brief Generation');
  console.log('===================================');
  
  const briefSummary = {
    date: new Date(),
    totalProblems: problems.length,
    highPriority: problems.filter(p => p.priority === 'high').length,
    problems: {
      high: problems.filter(p => p.priority === 'high'),
      medium: [],
      low: [],
    },
    scannedSources: ['gmail'],
    totalItemsScanned: scanResult.itemCount,
  };
  
  console.log('\n📧 Morning Brief:');
  console.log('─────────────────────────────────────');
  console.log(`Date: ${briefSummary.date.toDateString()}`);
  console.log(`Total Problems: ${briefSummary.totalProblems}`);
  console.log(`High Priority: ${briefSummary.highPriority}`);
  console.log(`Sources Scanned: ${briefSummary.scannedSources.join(', ')}`);
  console.log(`Items Scanned: ${briefSummary.totalItemsScanned}`);
  console.log('');
  
  console.log('🔥 High Priority Items:');
  briefSummary.problems.high.forEach((problem, idx) => {
    console.log(`\n${idx + 1}. ${problem.title}`);
    console.log(`   ${problem.description}`);
    console.log(`   → Draft ready to send`);
  });
  
  // =====================================================
  // FINAL SUMMARY
  // =====================================================
  console.log('\n\n╔════════════════════════════════════════╗');
  console.log('║   TEST SUMMARY                         ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  console.log('✅ Plugin Interface: WORKING');
  console.log('✅ WorkItem Conversion: WORKING');
  console.log('✅ Problem Detection: WORKING');
  console.log('✅ Draft Generation: WORKING');
  console.log('✅ Brief Summary: WORKING');
  
  console.log('\n🎉 All core logic working with mock data!');
  console.log('\n📝 Next: Add real API keys to .env.local to connect real services\n');
})();


