/**
 * Persists a processed signal after directive generation so the brain can see recent suggestions.
 */

import { createHash } from 'crypto';
import { createServerClient } from '@/lib/db/client';
import { encrypt } from '@/lib/encryption';

export async function persistDirectiveHistorySignal(params: {
  userId: string;
  actionId: string;
  directiveText: string;
  actionType: string;
  status: string;
}): Promise<void> {
  const clipped = params.directiveText.slice(0, 2000);
  const content = `Generated: ${clipped}. Action: ${params.actionType}. Status: ${params.status}`;
  const contentHash = createHash('sha256')
    .update(`foldera_directive:${params.userId}:${params.actionId}`)
    .digest('hex');

  const supabase = createServerClient();
  const { error } = await supabase.from('tkg_signals').insert({
    user_id: params.userId,
    source: 'foldera_directive',
    source_id: params.actionId,
    type: 'approval',
    content: encrypt(content),
    content_hash: contentHash,
    author: 'foldera-system',
    occurred_at: new Date().toISOString(),
    processed: true,
  });

  if (error && !String(error.message ?? '').includes('duplicate') && (error as { code?: string }).code !== '23505') {
    console.warn('[directive-history-signal] insert failed:', error.message);
  }
}
