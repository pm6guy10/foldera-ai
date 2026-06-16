import { test, expect } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encode } from 'next-auth/jwt';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local' });

const USER_ID = '2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f'; // Real non-owner user: b.kapp1010@gmail.com
const USER_EMAIL = 'b.kapp1010@gmail.com';
const USER_NAME = 'Brandon Kapp';

test.describe('Issue #344: Money Seam Loop Closure Proof', () => {
  test('closes workday-presence loop via browser Dismiss click', async ({ page }) => {
    const secret = process.env.NEXTAUTH_SECRET;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!secret || !supabaseUrl || !supabaseKey) {
      throw new Error('Missing local env variables in .env.local');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Reset user state before test to ensure the card is active/unsnoozed
    console.log('Resetting user state...');
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(USER_ID);
    if (userError) throw userError;

    const metadata = userData.user.user_metadata || {};
    const state = metadata.workday_presence_state || {};
    
    // Force active state: clear snoozed_until and set current_focus/next_move
    const activeState = {
      ...state,
      current_focus: 'Foldera pipe test — verify non-owner card delivery and receipt write',
      next_move: 'Confirm this card reaches the non-owner account and triggers a durable tkg_actions receipt.',
      why_it_matters: 'Mechanical non-owner loop proof: source sync + scorer SAFE_SILENCE proven from real data.',
      snoozed_until: null,
      blocker: null,
      waiting_on: null,
      draft: null,
    };

    const { error: updateError } = await supabase.auth.admin.updateUserById(USER_ID, {
      user_metadata: {
        ...metadata,
        workday_presence_state: activeState,
      }
    });
    if (updateError) throw updateError;

    // 2. Set next-auth session cookie
    console.log('Seeding session...');
    const sessionToken = await encode({
      secret,
      token: {
        sub: USER_ID,
        userId: USER_ID,
        email: USER_EMAIL,
        name: USER_NAME,
        hasOnboarded: true,
      },
    });

    const origin = 'http://localhost:3000';
    await page.context().addCookies([
      {
        name: 'next-auth.session-token',
        value: sessionToken,
        url: origin,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    // 3. Navigate to dashboard and verify the card renders
    console.log('Navigating to dashboard...');
    await page.goto(`${origin}/dashboard`);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForLoadState('networkidle');

    // Confirm card elements are visible
    const focusEl = page.locator('text=Foldera pipe test — verify non-owner card delivery and receipt write').first();
    await expect(focusEl).toBeVisible({ timeout: 15000 });

    console.log('Taking screenshot before click...');
    await page.screenshot({ path: 'docs/proofs/issue-344-before-dismiss.png', fullPage: true });

    // 4. Click the "Dismiss" button to close the loop
    console.log('Clicking Dismiss...');
    const dismissButton = page.getByRole('button', { name: 'Dismiss', exact: true });
    await expect(dismissButton).toBeVisible();
    await dismissButton.click();

    // 5. Verify the dashboard goes quiet and shows the setup prompt
    console.log('Waiting for quiet/setup mode...');
    const setupPrompt = page.locator('text=What are you trying to move forward today?');
    await expect(setupPrompt).toBeVisible({ timeout: 15000 });

    console.log('Taking screenshot after click...');
    await page.screenshot({ path: 'docs/proofs/issue-344-after-dismiss.png', fullPage: true });

    // 6. Query and verify the tkg_actions receipt row in Postgres
    console.log('Querying tkg_actions from database...');
    const { data: actions, error: actionsError } = await supabase
      .from('tkg_actions')
      .select('*')
      .eq('user_id', USER_ID)
      .eq('action_source', 'workday_presence')
      .order('approved_at', { ascending: false })
      .limit(1);

    if (actionsError) throw actionsError;
    expect(actions).toHaveLength(1);
    const receipt = actions[0];
    console.log('REAL DB ROW EVIDENCE:', JSON.stringify(receipt, null, 2));

    expect(receipt.status).toBe('draft_rejected');
    expect(receipt.action_type).toBe('presence_action');
  });
});
