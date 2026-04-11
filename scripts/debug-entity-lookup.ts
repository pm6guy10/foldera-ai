import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Look up entity aa7733d9-a098-47a0-9acf-57977320ecc8
  const { data, error } = await supabase
    .from('tkg_entities')
    .select('id, name, primary_email, emails, user_id, last_interaction')
    .eq('id', 'aa7733d9-a098-47a0-9acf-57977320ecc8')
    .single();

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Entity aa7733d9:', JSON.stringify(data, null, 2));
  }

  // Also show top 10 external entities (not the user) by interaction count
  const { data: entities } = await supabase
    .from('tkg_entities')
    .select('id, name, primary_email, last_interaction, total_interactions')
    .eq('user_id', 'e40b7cd8-4925-42f7-bc99-5022969f1d22')
    .not('id', 'in', '(115183eb-3f49-438c-b1cd-f5b67eb15f1f,2d576b3c-db81-4e7c-9622-c3478a8a5c2c)')
    .order('total_interactions', { ascending: false })
    .limit(15);

  console.log('\nTop external entities:', JSON.stringify(entities, null, 2));
}

main().catch(console.error);
