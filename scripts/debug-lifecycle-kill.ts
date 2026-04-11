import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const userId = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

  // Get commitments that are NOT suppressed and have active/at_risk status
  // These are the ones the scorer would consider
  const { data: commitments, error } = await supabase
    .from('tkg_commitments')
    .select('id, description, status, due_at, suppressed_at, created_at')
    .eq('user_id', userId)
    .is('suppressed_at', null)
    .in('status', ['active', 'at_risk'])
    .order('due_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  const now = new Date();
  console.log(`Found ${commitments?.length ?? 0} active/at_risk unsuppressed commitments\n`);

  for (const c of commitments ?? []) {
    const due = (c.due_at) as string | null;
    let daysUntilDue: number | null = null;
    let urgency = 0.3; // default no deadline

    if (due) {
      daysUntilDue = (new Date(due).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysUntilDue < 0) {
        urgency = 1.0; // overdue
      } else {
        urgency = 1 / (1 + Math.exp(1.0 * (daysUntilDue - 5)));
      }
    }

    const lifecycle = urgency < 0.25 ? 'DORMANT (would be killed)' : 'ACTIVE';
    console.log(`[${lifecycle}] ${(c.description as string).slice(0, 80)}`);
    console.log(`  status: ${c.status}, due: ${due ?? 'null'}, daysUntilDue: ${daysUntilDue?.toFixed(1) ?? 'N/A'}, urgency: ${urgency.toFixed(3)}`);
    console.log();
  }
}

main().catch(console.error);
