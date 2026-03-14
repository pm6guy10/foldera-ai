/**
 * Conversion tracker — logs UTM/ref visits and conversion events as signals.
 *
 * Three signal types:
 *   1. growth_visit:      visitor arrived with ?ref= param
 *   2. growth_onboard:    visitor completed /try or /start
 *   3. growth_conversion: visitor subscribed via Stripe
 *
 * Each visit signal includes the ref param so we can trace back to the
 * originating growth action and update its tkg_pattern_metrics (Bayesian
 * tractability self-calibration).
 */

import { createHash } from 'crypto';
import { createServerClient } from '@/lib/db/client';
import { encrypt } from '@/lib/encryption';

// ---------------------------------------------------------------------------
// Log a visit with referral tracking
// ---------------------------------------------------------------------------

export async function logGrowthVisit(params: {
  ref:         string;       // e.g. "reddit-abc123" or "hn-456"
  path:        string;       // e.g. "/", "/try", "/start"
  userAgent?:  string;
  userId?:     string;       // INGEST_USER_ID if available
}): Promise<void> {
  const { ref, path, userAgent } = params;
  const userId = params.userId ?? process.env.INGEST_USER_ID;
  if (!userId) return;

  // Parse ref into source and id: "reddit-abc123" → { source: "reddit", id: "abc123" }
  const dashIdx = ref.indexOf('-');
  const refSource = dashIdx > 0 ? ref.slice(0, dashIdx) : ref;
  const refId     = dashIdx > 0 ? ref.slice(dashIdx + 1) : '';

  const contentHash = createHash('sha256')
    .update(`growth_visit:${ref}:${path}:${new Date().toISOString().slice(0, 10)}`)
    .digest('hex');

  const content = encrypt(
    `[Growth Visit] ref=${ref} path=${path} source=${refSource} ` +
    `Visitor arrived at foldera.ai from a growth action. ` +
    `Goal: acquire paying users, convert visitors, grow customer base.`
  );

  const supabase = createServerClient();
  const { error } = await supabase.from('tkg_signals').insert({
    user_id:      userId,
    source:       'growth_visit',
    type:         'growth_conversion',
    content,
    content_hash: contentHash,
    occurred_at:  new Date().toISOString(),
    processed:    true,
    metadata: {
      ref,
      ref_source: refSource,
      ref_id:     refId,
      path,
      user_agent: userAgent?.slice(0, 200),
    },
  });

  if (error && error.code !== '23505') {
    console.warn('[conversion-tracker] visit insert failed:', error.message);
  }
}

// ---------------------------------------------------------------------------
// Log an onboarding completion (/try or /start)
// ---------------------------------------------------------------------------

export async function logGrowthOnboard(params: {
  ref?:    string;
  path:    string;        // "/try" or "/start"
  userId?: string;
}): Promise<void> {
  const userId = params.userId ?? process.env.INGEST_USER_ID;
  if (!userId) return;

  const content = encrypt(
    `[Growth Onboard] path=${params.path} ref=${params.ref ?? 'direct'} ` +
    `Someone completed onboarding. This is a successful step toward acquiring a paying user. ` +
    `Goal: acquire paying users, convert visitors, grow customer base.`
  );

  const contentHash = createHash('sha256')
    .update(`growth_onboard:${params.path}:${new Date().toISOString().slice(0, 13)}`)
    .digest('hex');

  const supabase = createServerClient();
  const { error } = await supabase.from('tkg_signals').insert({
    user_id:      userId,
    source:       'growth_onboard',
    type:         'growth_conversion',
    content,
    content_hash: contentHash,
    occurred_at:  new Date().toISOString(),
    processed:    true,
    metadata: {
      ref: params.ref ?? 'direct',
      path: params.path,
    },
  });

  if (error && error.code !== '23505') {
    console.warn('[conversion-tracker] onboard insert failed:', error.message);
  }

  // If there's a ref, try to update the originating growth action's outcome
  if (params.ref) {
    await closeGrowthOutcome(userId, params.ref, 'onboard');
  }
}

// ---------------------------------------------------------------------------
// Log a Stripe conversion
// ---------------------------------------------------------------------------

export async function logGrowthConversion(params: {
  ref?:           string;
  email?:         string;
  stripeCustomer?: string;
  userId?:        string;
}): Promise<void> {
  const userId = params.userId ?? process.env.INGEST_USER_ID;
  if (!userId) return;

  const content = encrypt(
    `[Growth Conversion] A visitor converted to a paying customer! ` +
    `ref=${params.ref ?? 'unknown'} email=${params.email ?? 'unknown'} ` +
    `This is the ultimate success signal for user acquisition. ` +
    `Goal: acquire paying users, convert visitors, grow customer base.`
  );

  const contentHash = createHash('sha256')
    .update(`growth_conversion:${params.email ?? ''}:${new Date().toISOString().slice(0, 10)}`)
    .digest('hex');

  const supabase = createServerClient();
  const { error } = await supabase.from('tkg_signals').insert({
    user_id:      userId,
    source:       'growth_conversion',
    type:         'growth_conversion',
    content,
    content_hash: contentHash,
    occurred_at:  new Date().toISOString(),
    processed:    true,
    metadata: {
      ref: params.ref ?? 'direct',
      email: params.email,
      stripe_customer: params.stripeCustomer,
      weight: 5.0,  // Highest signal weight
    },
  });

  if (error && error.code !== '23505') {
    console.warn('[conversion-tracker] conversion insert failed:', error.message);
  }

  // Close the growth outcome with successful_outcome on pattern_metrics
  if (params.ref) {
    await closeGrowthOutcome(userId, params.ref, 'conversion');
  }
}

// ---------------------------------------------------------------------------
// Close a growth outcome — update tkg_pattern_metrics for Bayesian learning
// ---------------------------------------------------------------------------

async function closeGrowthOutcome(
  userId:  string,
  ref:     string,
  outcome: 'onboard' | 'conversion',
): Promise<void> {
  const supabase = createServerClient();

  // Parse ref to get the source channel
  const dashIdx = ref.indexOf('-');
  const refSource = dashIdx > 0 ? ref.slice(0, dashIdx) : ref;

  // The pattern_hash for growth actions is "send_message:growth"
  // (since growth replies are send_message action_type in the growth domain)
  const patternHash = `send_message:growth`;

  try {
    const { data: pm } = await supabase
      .from('tkg_pattern_metrics')
      .select('total_activations, successful_outcomes, failed_outcomes')
      .eq('user_id', userId)
      .eq('pattern_hash', patternHash)
      .maybeSingle();

    // Conversion = strong success, onboard = moderate success
    const successIncrement = outcome === 'conversion' ? 3 : 1;

    await supabase.from('tkg_pattern_metrics').upsert(
      {
        user_id: userId,
        pattern_hash: patternHash,
        category: 'send_message',
        domain: 'growth',
        total_activations: pm?.total_activations ?? 0,
        successful_outcomes: (pm?.successful_outcomes ?? 0) + successIncrement,
        failed_outcomes: pm?.failed_outcomes ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,pattern_hash' },
    );

    // Also update channel-specific metrics for per-channel learning
    const channelPatternHash = `send_message:growth_${refSource}`;
    const { data: cpm } = await supabase
      .from('tkg_pattern_metrics')
      .select('total_activations, successful_outcomes, failed_outcomes')
      .eq('user_id', userId)
      .eq('pattern_hash', channelPatternHash)
      .maybeSingle();

    await supabase.from('tkg_pattern_metrics').upsert(
      {
        user_id: userId,
        pattern_hash: channelPatternHash,
        category: 'send_message',
        domain: `growth_${refSource}`,
        total_activations: cpm?.total_activations ?? 0,
        successful_outcomes: (cpm?.successful_outcomes ?? 0) + successIncrement,
        failed_outcomes: cpm?.failed_outcomes ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,pattern_hash' },
    );

    console.log(`[conversion-tracker] Closed growth outcome: ${outcome} from ${refSource} (${ref})`);
  } catch (err) {
    console.warn('[conversion-tracker] outcome close failed:', err instanceof Error ? err.message : err);
  }
}
