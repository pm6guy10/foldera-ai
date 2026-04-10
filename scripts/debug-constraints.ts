import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

  // Get all active constraints
  const { data: constraints } = await supabase
    .from('tkg_constraints')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  console.log('=== ACTIVE CONSTRAINTS ===');
  for (const c of constraints ?? []) {
    console.log(JSON.stringify(c, null, 2));
  }

  // Check if keri is locked
  const keriLocked = (constraints ?? []).some(c => 
    (c.normalized_entity as string ?? '').toLowerCase().includes('keri') ||
    (c.normalized_entity as string ?? '').toLowerCase().includes('nopens')
  );
  console.log('\nKeri locked:', keriLocked);

  // Get suppressed candidates
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: suppressed } = await supabase
    .from('tkg_actions')
    .select('id, directive_text, action_type, status, generated_at')
    .eq('user_id', userId)
    .in('status', ['skipped', 'rejected', 'failed'])
    .gte('generated_at', sevenDaysAgo);

  console.log('\n=== RECENTLY SUPPRESSED ACTIONS (7d) ===');
  for (const a of suppressed ?? []) {
    console.log(`  [${a.status}] ${a.action_type} | ${(a.directive_text as string ?? '').slice(0, 80)}`);
  }

  // Get goals to understand what drift is about
  const { data: goals } = await supabase
    .from('tkg_goals')
    .select('*')
    .eq('user_id', userId);
  
  console.log('\n=== GOALS ===');
  for (const g of goals ?? []) {
    console.log(`  P${g.priority} [${g.goal_category}]: ${g.goal_text?.slice(0, 100)}`);
  }
}

main().catch(console.error);
