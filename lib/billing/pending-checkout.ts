export const PENDING_CHECKOUT_KEY = 'foldera_pending_checkout';

export type PendingCheckoutPlan = 'pro';

type ResumePendingCheckoutOptions = {
  onError?: (message: string) => void;
  onUnauthorized?: () => void;
  redirect?: (url: string) => void;
};

function readPendingCheckoutPlan(): PendingCheckoutPlan | null {
  if (typeof window === 'undefined') return null;
  const value = window.sessionStorage.getItem(PENDING_CHECKOUT_KEY);
  return value === 'pro' ? 'pro' : null;
}

export function clearPendingCheckoutPlan(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
}

export function writePendingCheckoutPlan(plan: PendingCheckoutPlan): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PENDING_CHECKOUT_KEY, plan);
}

export async function resumePendingCheckout(
  options: ResumePendingCheckoutOptions = {},
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const plan = readPendingCheckoutPlan();
  if (!plan) return false;

  clearPendingCheckoutPlan();

  try {
    const response = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.status === 401) {
      writePendingCheckoutPlan(plan);
      options.onUnauthorized?.();
      return false;
    }

    if (!response.ok || typeof payload?.url !== 'string') {
      writePendingCheckoutPlan(plan);
      options.onError?.('Could not start Pro checkout right now. Try again in a moment.');
      return false;
    }

    (options.redirect ?? ((url: string) => {
      window.location.href = url;
    }))(payload.url);
    return true;
  } catch {
    writePendingCheckoutPlan(plan);
    options.onError?.('Could not start Pro checkout right now. Try again in a moment.');
    return false;
  }
}
