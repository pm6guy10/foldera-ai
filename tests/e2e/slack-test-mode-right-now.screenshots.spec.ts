import { test, expect } from '@playwright/test';

test.describe('Slack test-mode Right Now screenshots', () => {
  test('captures Right Now + action interactions', async ({ page }) => {
    await page.route('**/api/slack/test-mode/right-now', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          payload: {
            kind: 'right_now',
            mode: 'active',
            text: 'Right now.\nReturn here: Close ACME renewal decision\nNext move: Send owner confirmation note\nWhy this matters: The renewal window closes at 4 PM PT.\nStop when this is done: Close ACME renewal decision moved forward.',
            actions: [
              { id: 'done', label: 'Done' },
              { id: 'stuck', label: 'Stuck' },
              { id: 'break_smaller', label: 'Break smaller' },
              { id: 'snooze', label: 'Snooze' },
            ],
          },
          slack_test_mode: {
            channel: 'test_dm',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: 'Right now.\nNext move: Send owner confirmation note' },
              },
              {
                type: 'actions',
                elements: [
                  { type: 'button', text: { type: 'plain_text', text: 'Done' }, action_id: 'done' },
                  { type: 'button', text: { type: 'plain_text', text: 'Stuck' }, action_id: 'stuck' },
                  { type: 'button', text: { type: 'plain_text', text: 'Break smaller' }, action_id: 'break_smaller' },
                  { type: 'button', text: { type: 'plain_text', text: 'Snooze' }, action_id: 'snooze' },
                ],
              },
            ],
          },
        }),
      });
    });

    const interactionBodies: Record<string, string> = {
      done: 'Right now.\nNext move: Write the next smallest step…',
      stuck: 'Right now.\nNext move: Blocked by \"Waiting on owner reply\"…',
      break_smaller: 'Right now.\nNext move: Break it smaller…',
      snooze: 'Right now.\nNext move: Send owner confirmation note',
    };

    await page.route('**/api/slack/test-mode/interaction', async (route) => {
      const req = route.request();
      const postData = req.postData() || '{}';
      const parsed = JSON.parse(postData) as { action_id?: string };
      const actionId = parsed.action_id ?? 'unknown';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          action_id: actionId,
          payload: {
            kind: 'right_now',
            mode: 'active',
            text: interactionBodies[actionId] ?? `Right now.\nNext move: (${actionId})`,
            actions: [
              { id: 'done', label: 'Done' },
              { id: 'stuck', label: 'Stuck' },
              { id: 'break_smaller', label: 'Break smaller' },
              { id: 'snooze', label: 'Snooze' },
            ],
          },
          slack_test_mode: {
            channel: 'test_dm',
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text: interactionBodies[actionId] ?? '' } },
              {
                type: 'actions',
                elements: [
                  { type: 'button', text: { type: 'plain_text', text: 'Done' }, action_id: 'done' },
                  { type: 'button', text: { type: 'plain_text', text: 'Stuck' }, action_id: 'stuck' },
                  { type: 'button', text: { type: 'plain_text', text: 'Break smaller' }, action_id: 'break_smaller' },
                  { type: 'button', text: { type: 'plain_text', text: 'Snooze' }, action_id: 'snooze' },
                ],
              },
            ],
          },
          state: {
            current_focus: 'Close ACME renewal decision',
            next_move: '...',
            why_it_matters: '...',
            blocker: null,
            do_not_touch: null,
            waiting_on: null,
            last_completed_step: null,
            state_source: 'manual_anchor',
            created_at: '2026-05-20T12:00:00.000Z',
            updated_at: '2026-05-20T12:10:00.000Z',
          },
        }),
      });
    });

    await page.goto('http://localhost:3000/slack/test-mode');
    await expect(page.getByTestId('slack-test-mode-thread')).toBeVisible();

    await page.setViewportSize({ width: 820, height: 900 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'docs/pr-58-screens/slack-test-mode-right-now.png', fullPage: true });

    await page.getByTestId('action-done').click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'docs/pr-58-screens/slack-test-mode-done.png', fullPage: true });

    await page.getByTestId('action-stuck').click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'docs/pr-58-screens/slack-test-mode-stuck.png', fullPage: true });

    await page.getByTestId('action-break_smaller').click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'docs/pr-58-screens/slack-test-mode-break-smaller.png', fullPage: true });

    await page.getByTestId('action-snooze').click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'docs/pr-58-screens/slack-test-mode-snooze.png', fullPage: true });
  });
});

