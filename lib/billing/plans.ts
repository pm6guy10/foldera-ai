export type PlanName = 'free' | 'pro' | 'team';

export interface PlanFeatures {
  documentsPerMonth: number;
  conflictDetection: boolean;
  aiAnalysis: boolean;
  teamCollaboration: boolean;
  prioritySupport: boolean;
  advancedReporting: boolean;
  apiAccess: boolean;
}

export interface SubscriptionPlan {
  id: PlanName;
  name: string;
  description: string;
  price: number; // in cents
  priceId: string; // Stripe Price ID
  interval: 'month' | 'year';
  features: PlanFeatures;
  popular?: boolean;
}

// Subscription plans configuration
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Perfect for trying out Foldera',
    price: 0,
    priceId: '', // No Stripe price needed for free tier
    interval: 'month',
    features: {
      documentsPerMonth: 3,
      conflictDetection: true,
      aiAnalysis: false,
      teamCollaboration: false,
      prioritySupport: false,
      advancedReporting: false,
      apiAccess: false,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For professionals who need more power',
    price: 2900, // $29/month
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || 'price_pro_monthly',
    interval: 'month',
    popular: true,
    features: {
      documentsPerMonth: 100,
      conflictDetection: true,
      aiAnalysis: true,
      teamCollaboration: false,
      prioritySupport: true,
      advancedReporting: true,
      apiAccess: false,
    },
  },
  {
    id: 'team',
    name: 'Team',
    description: 'For teams that collaborate on documents',
    price: 9900, // $99/month
    priceId: process.env.NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID || 'price_team_monthly',
    interval: 'month',
    features: {
      documentsPerMonth: 500,
      conflictDetection: true,
      aiAnalysis: true,
      teamCollaboration: true,
      prioritySupport: true,
      advancedReporting: true,
      apiAccess: true,
    },
  },
];

// Helper functions
export function getPlanByName(planName: PlanName): SubscriptionPlan {
  const plan = SUBSCRIPTION_PLANS.find(p => p.id === planName);
  if (!plan) {
    throw new Error(`Plan ${planName} not found`);
  }
  return plan;
}

export function getPlanByPriceId(priceId: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find(p => p.priceId === priceId);
}

export function formatPrice(priceInCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(priceInCents / 100);
}

export function canAccessFeature(planName: PlanName, feature: keyof PlanFeatures): boolean {
  const plan = getPlanByName(planName);
  return plan.features[feature] as boolean;
}

export function getDocumentLimit(planName: PlanName): number {
  const plan = getPlanByName(planName);
  return plan.features.documentsPerMonth;
}
