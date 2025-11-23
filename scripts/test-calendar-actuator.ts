
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { CalendarActuator } from '@/lib/plugins/google-calendar/actuator';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('📅 CALENDAR ACTUATOR TEST');
  console.log('===================================');

  try {
    // 1. Get user
    console.log('👤 Getting user...');
    const { data: users, error } = await supabase
      .from('meeting_prep_users')
      .select('id, email')
      .not('google_access_token', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error || !users?.length) {
      throw new Error('No valid user found. Please sign in.');
    }

    const user = users[0];
    console.log(`✅ Found user: ${user.email}`);

    const actuator = new CalendarActuator(user.id);

    // 2. Create a dummy event to move
    console.log('🛠️  Creating test event...');
    const now = Date.now();
    // Start in 10 mins
    const originalStart = new Date(now + 10 * 60000).toISOString(); 
    const originalEnd = new Date(now + 40 * 60000).toISOString();

    const testEvent = await actuator.createEvent(
      'Actuator Test: Original Time',
      originalStart,
      originalEnd,
      'This event will be moved by the actuator.'
    );
    
    if (!testEvent.id) throw new Error('Failed to create test event');
    console.log(`✅ Created event at ${originalStart}`);

    // 3. Test: Move Event
    console.log('🚀 Testing moveEvent()...');
    // Move to 2 hours later
    const newStart = new Date(now + 120 * 60000).toISOString();
    const newEnd = new Date(now + 150 * 60000).toISOString();

    const movedEvent = await actuator.moveEvent(
      testEvent.id,
      newStart,
      newEnd
    );

    // Verify locally
    if (movedEvent.start?.dateTime !== newStart) {
      throw new Error('Event start time does not match requested time.');
    }

    console.log(`✅ SUCCESS: Event moved to ${newStart}`);
    console.log(`   Link: ${movedEvent.htmlLink}`);

    // 4. Clean up
    console.log('🗑️  Cleaning up (deleting test event)...');
    // Manual delete for now as we haven't implemented delete in actuator
    // Ideally we would have: await actuator.deleteEvent(testEvent.id);
    
    console.log('🎉 ACTUATOR VERIFIED.');

  } catch (error: any) {
    console.error('❌ TEST FAILED:', error.message);
    if (error.response) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();


