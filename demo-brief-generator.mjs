#!/usr/bin/env node
/**
 * DEMO: Meeting Brief Generator (No API Keys Needed)
 * Shows how the briefing logic works with mock data
 * Run: node demo-brief-generator.mjs
 */

console.log('\n🎯 FOLDERA MEETING BRIEF - DEMO\n');
console.log('='.repeat(70));
console.log('\nThis demo shows how your AI Chief of Staff works.');
console.log('No API keys needed - using mock data.\n');
console.log('='.repeat(70));

// Mock Meeting Data
const meeting = {
  id: 'mock-123',
  title: 'Q4 Planning with Sarah Chen',
  start_time: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
  attendees: [
    { email: 'sarah.chen@acme.com', name: 'Sarah Chen', role: 'VP Product' },
    { email: 'you@yourcompany.com', name: 'You', role: 'Customer Success' }
  ],
  description: 'Quarterly planning session - discussing roadmap and resources'
};

// Mock Email Context (what the AI would analyze)
const emailContext = [
  {
    from: 'sarah.chen@acme.com',
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    subject: 'Re: Budget constraints',
    snippet: 'Given the recent headcount freeze, we need to be creative about Q4...'
  },
  {
    from: 'you@yourcompany.com',
    date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 2 weeks ago
    subject: 'Q4 Roadmap Draft',
    snippet: 'Attached is the Q4 roadmap you requested. Let me know if you need changes...'
  },
  {
    from: 'sarah.chen@acme.com',
    date: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000), // 3 weeks ago
    subject: 'Project Phoenix Update',
    snippet: 'Still waiting on the vendor. This delay is really frustrating...'
  },
  {
    from: 'sarah.chen@acme.com',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    subject: 'Leadership Meeting Notes',
    snippet: 'CFO announced they\'re tightening budgets across all departments...'
  }
];

// Mock Calendar Data
const recentMeetings = [
  {
    title: 'Weekly Check-in with Sarah',
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    notes: 'Discussed resource allocation, Sarah seemed stressed'
  }
];

// DEMO: Brief Generation Logic
console.log('\n📊 ANALYZING CONTEXT...\n');
console.log(`Meeting: ${meeting.title}`);
console.log(`Time: ${meeting.start_time.toLocaleString()}`);
console.log(`Attendees: ${meeting.attendees.map(a => a.name).join(', ')}`);
console.log(`\nAnalyzing ${emailContext.length} email threads...`);
console.log(`Analyzing ${recentMeetings.length} recent meetings...`);

// Simulate AI analysis
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  await sleep(1000);
  
  // Generate Brief (this is what Claude would generate)
  const brief = {
    meeting_title: meeting.title,
    attendees: meeting.attendees,
    timing: {
      meeting_time: meeting.start_time,
      brief_generated: new Date(),
      advance_notice: '30 minutes'
    },
    key_context: [
      '💰 Budget Constraints: Sarah mentioned budget freeze in email from 2 days ago',
      '📋 Pending Deliverable: Q4 roadmap was sent 2 weeks ago - still awaiting feedback',
      '👥 Team Changes: Headcount freeze mentioned - Sarah is concerned about capacity',
      '⏰ Project Phoenix: 3-week delay has Sarah frustrated with vendor',
      '💼 Leadership Pressure: CFO tightening budgets across all departments'
    ],
    what_to_say: [
      '✅ "I have that Q4 roadmap update ready for review"',
      '✅ "Given resource constraints, here\'s how we can prioritize effectively"',
      '✅ "I understand the budget situation - let\'s focus on high-impact initiatives"',
      '✅ "How can I help ease the capacity concerns?"'
    ],
    what_to_avoid: [
      '❌ Don\'t bring up Project Phoenix timeline - she\'s already frustrated',
      '❌ Don\'t ask for additional budget or headcount',
      '❌ Avoid mentioning vendor issues - sensitive topic with leadership',
      '❌ Don\'t push back on resource constraints - she\'s under pressure from CFO'
    ],
    open_threads: [
      '📧 Q4 Roadmap: Sent 2 weeks ago, no response yet',
      '🤔 Follow up needed: What specific Q4 priorities should we focus on?',
      '💡 Opportunity: Offer solutions for doing more with less'
    ],
    relationship_notes: [
      '📊 Communication Style: Direct, appreciates solutions not problems',
      '⚡ Current State: Under pressure from leadership, stressed about capacity',
      '🎯 What She Values: Efficiency, pragmatism, proactive thinking',
      '⏱️ Recent Interaction: Weekly check-in 7 days ago - discussed resources'
    ],
    recommended_approach: 'Lead with solutions. Acknowledge constraints. Be concise.'
  };

  // Display the Brief
  console.log('\n✅ BRIEF GENERATED!\n');
  console.log('='.repeat(70));
  console.log('\n📧 YOU WOULD RECEIVE THIS EMAIL:\n');
  console.log('='.repeat(70));
  
  console.log('\n┌─────────────────────────────────────────────────────────────────────┐');
  console.log('│ 📅 MEETING BRIEF                                                    │');
  console.log('├─────────────────────────────────────────────────────────────────────┤');
  console.log(`│ Meeting: ${meeting.title.padEnd(57)}│`);
  console.log(`│ Time: ${meeting.start_time.toLocaleString().padEnd(60)}│`);
  console.log(`│ With: ${meeting.attendees[0].name} (${meeting.attendees[0].role})`.padEnd(70) + '│');
  console.log('└─────────────────────────────────────────────────────────────────────┘\n');

  console.log('🔑 KEY CONTEXT:\n');
  brief.key_context.forEach((item, i) => {
    console.log(`   ${i + 1}. ${item}`);
  });

  console.log('\n✅ WHAT TO SAY:\n');
  brief.what_to_say.forEach((item, i) => {
    console.log(`   ${item}`);
  });

  console.log('\n⚠️  WHAT TO AVOID:\n');
  brief.what_to_avoid.forEach((item, i) => {
    console.log(`   ${item}`);
  });

  console.log('\n🔄 OPEN THREADS:\n');
  brief.open_threads.forEach((item, i) => {
    console.log(`   ${item}`);
  });

  console.log('\n👤 RELATIONSHIP NOTES:\n');
  brief.relationship_notes.forEach((item, i) => {
    console.log(`   ${item}`);
  });

  console.log('\n💡 RECOMMENDED APPROACH:\n');
  console.log(`   ${brief.recommended_approach}\n`);

  console.log('='.repeat(70));
  console.log('\n✨ THIS IS WHAT FOLDERA DOES AUTOMATICALLY:\n');
  console.log('   ✅ Analyzes all your emails with this person');
  console.log('   ✅ Checks recent calendar interactions');
  console.log('   ✅ Identifies what\'s important vs noise');
  console.log('   ✅ Flags sensitive topics to avoid');
  console.log('   ✅ Reminds you of pending commitments');
  console.log('   ✅ Delivers this 30 minutes before your meeting');
  console.log('   ✅ Zero effort required from you\n');

  console.log('='.repeat(70));
  console.log('\n📊 MOCK METRICS:\n');
  console.log(`   Context analyzed: ${emailContext.length} emails, ${recentMeetings.length} meetings`);
  console.log(`   Key insights: ${brief.key_context.length} items`);
  console.log(`   Talking points: ${brief.what_to_say.length} suggestions`);
  console.log(`   Landmines avoided: ${brief.what_to_avoid.length} warnings`);
  console.log(`   Open threads: ${brief.open_threads.length} reminders`);
  console.log(`   Generation time: ~2.3 seconds (mock)`);
  console.log(`   AI model: Claude 3.5 Sonnet (in production)`);
  console.log(`   Estimated cost: $0.03 per brief\n`);

  console.log('='.repeat(70));
  console.log('\n🎯 VALUE DELIVERED:\n');
  console.log('   Time saved: ~20 minutes of prep work');
  console.log('   Risk avoided: Multiple conversational landmines');
  console.log('   Opportunities: 3 ways to add value identified');
  console.log('   Professional edge: Walking in fully prepared\n');

  console.log('='.repeat(70));
  console.log('\n🚀 TO GET THIS WORKING FOR REAL:\n');
  console.log('   1. Add your API keys to .env.local');
  console.log('   2. Connect your Google Calendar + Gmail');
  console.log('   3. Let it run - briefs arrive automatically');
  console.log('   4. Show up to meetings like a genius\n');

  console.log('='.repeat(70));
  console.log('\n💡 QUICK START:\n');
  console.log('   node test-setup.js      ← Check what you need');
  console.log('   npm install             ← Install dependencies');
  console.log('   npm run dev             ← Start the app');
  console.log('   http://localhost:3000   ← See your landing page\n');

  console.log('='.repeat(70));
  console.log('\n✨ Your AI Chief of Staff is ready to work.\n');
})();
