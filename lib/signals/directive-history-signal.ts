/**
 * Persists a processed signal after directive generation so the brain can see recent suggestions.
 */

import { createHash } from 'crypto';
import { createServerClient } from '@/lib/db/client';
import { encrypt } from '@/lib/encryption';

let directiveHistorySignalSchemaUnsupported = false;

function isDirectiveHistorySchemaCompatError(error: { message?: string } | null | undefined): boolean {
  const message = String(error?.message ?? '');
  return (
    message.includes('tkg_signals_source_check') ||
    message.includes('tkg_signals_type_check')
  );
}

export async function persistDirectiveHistorySignal(params: {
  userId: string;
  actionId: string;
  directiveText: string;
  actionType: string;
  status: string;
}): Promise<void> {
  if (directiveHistorySignalSchemaUnsupported) {
    return;
  }

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

  if (!error) {
    return;
  }

  if (String(error.message ?? '').includes('duplicate') || (error as { code?: string }).code === '23505') {
    return;
  }

  if (isDirectiveHistorySchemaCompatError(error)) {
    directiveHistorySignalSchemaUnsupported = true;
    return;
  }

  if (error) {
    console.warn('[directive-history-signal] insert failed:', error.message);
  }
}
