import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const OWNER = process.env.INGEST_USER_ID!;

async function main() {
  const { data: authData } = await sb.auth.admin.getUserById(OWNER);
  const user = authData?.user;
  console.log('email:', user?.email);
  console.log('user_metadata:', JSON.stringify(user?.user_metadata, null, 2));
  console.log('identities:', JSON.stringify(user?.identities?.map(id => ({
    provider: id.provider,
    identity_data: id.identity_data,
  })), null, 2));
  
  // Test the name token building logic:
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const fullName = (meta?.['full_name'] ?? meta?.['name'] ?? '') as string;
  console.log('\nfull_name from metadata:', fullName);
  
  let selfNameTokens: string[] = [];
  if (fullName) {
    selfNameTokens = fullName.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  }
  for (const identity of (user?.identities ?? [])) {
    const id = identity.identity_data as Record<string, unknown> | undefined;
    const given = id?.['given_name'] as string | undefined;
    const family = id?.['family_name'] as string | undefined;
    if (given) for (const t of given.toLowerCase().split(/\s+/)) if (t.length >= 2 && !selfNameTokens.includes(t)) selfNameTokens.push(t);
    if (family) for (const t of family.toLowerCase().split(/\s+/)) if (t.length >= 2 && !selfNameTokens.includes(t)) selfNameTokens.push(t);
  }
  console.log('\nselfNameTokens:', selfNameTokens);
  
  // Test against "brandon d kapp"
  const entName = 'brandon d kapp';
  const entTokens = entName.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  const matchedTokens = entTokens.filter(t => selfNameTokens.includes(t));
  console.log('\nEntity tokens:', entTokens);
  console.log('Matched tokens:', matchedTokens);
  console.log('Would exclude (>=2 matches):', matchedTokens.length >= 2);
  
  // Also check the entity directly
  const { data: entity } = await sb.from('tkg_entities')
    .select('id,name,primary_email,emails')
    .eq('id', '2d576b3c-db81-4e7c-9622-c3478a8a5c2c')
    .single();
  console.log('\nEntity 2d576b3c:', entity);
}

main().catch(console.error);
