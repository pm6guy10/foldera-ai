/**
 * Kill switch: one tkg_goals row per owner — source=system_config, goal_text=agents_enabled.
 * status 'active' => agents run; 'abandoned' => all agents no-op.
 * Missing row => enabled (default on).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { OWNER_USER_ID } from '@/lib/auth/constants';

const GOAL_TEXT = 'agents_enabled';

export async function areAgentsEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from('tkg_goals')
    .select('status')
    .eq('user_id', OWNER_USER_ID)
    .eq('source', 'system_config')
    .eq('goal_text', GOAL_TEXT)
    .maybeSingle();

  if (error || !data) {
    return true;
  }

  return (data.status as string) === 'active';
}

export async function setAgentsEnabled(
  supabase: SupabaseClient,
  enabled: boolean,
): Promise<void> {
  const status = enabled ? 'active' : 'abandoned';
  const { data: existing } = await supabase
    .from('tkg_goals')
    .select('id')
    .eq('user_id', OWNER_USER_ID)
    .eq('source', 'system_config')
    .eq('goal_text', GOAL_TEXT)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from('tkg_goals')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('tkg_goals').insert({
    user_id: OWNER_USER_ID,
    goal_text: GOAL_TEXT,
    goal_category: 'other',
    goal_type: 'short_term',
    priority: 1,
    source: 'system_config',
    status,
    current_priority: false,
  });

  if (error) throw error;
}

export { GOAL_TEXT as AGENTS_ENABLED_GOAL_TEXT };
