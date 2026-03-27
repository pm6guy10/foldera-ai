-- Remove immortal test subscription for seeded test account.
-- This account (gate2-test@foldera.ai) has a pro plan with no expiry
-- and should not persist in the production subscriptions table.
DELETE FROM user_subscriptions
WHERE user_id = '22222222-2222-2222-2222-222222222222';
