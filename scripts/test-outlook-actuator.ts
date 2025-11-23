
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { OutlookActuator } from '@/lib/plugins/outlook/actuator';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('📅 OUTLOOK ACTUATOR TEST');
  
  try {
    // 1. Find a user with Azure AD connected
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('user_id')
      .eq('provider', 'azure_ad')
      .limit(1);

    if (error || !integrations?.length) {
      throw new Error('No user with Outlook integration found. Please sign in with Microsoft first.');
    }

    const userId = integrations[0].user_id;
    console.log(`✅ Found user with Outlook: ${userId}`);

    const actuator = new OutlookActuator(userId);

    // 2. Create a test event
    const startTime = new Date();
    startTime.setHours(startTime.getHours() + 1); // 1 hour from now
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + 30); // 30 min duration

    console.log('🛠️ Creating test event...');
    const createdEvent = await actuator.createEvent(
      'Foldera Outlook Test',
      startTime.toISOString(),
      endTime.toISOString(),
      'This is a test event created by Foldera.'
    );
    console.log(`✅ Event created: ${createdEvent.id}`);

    // 3. Move the event (push by 1 hour)
    const newStart = new Date(startTime);
    newStart.setHours(newStart.getHours() + 1);
    const newEnd = new Date(endTime);
    newEnd.setHours(newEnd.getHours() + 1);

    console.log('🔄 Moving test event...');
    await actuator.moveEvent(createdEvent.id, newStart.toISOString(), newEnd.toISOString());
    console.log('✅ Event moved.');

    // 4. Delete the event
    console.log('🗑️ Deleting test event...');
    await actuator.deleteEvent(createdEvent.id);
    console.log('✅ Event deleted.');

    console.log('🎉 TEST PASSED: Outlook Actuator works!');

  } catch (error: any) {
    console.error('❌ TEST FAILED:', error.message);
    if (error.response?.data) {
        console.error('API Error Details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

main();

