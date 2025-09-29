import { createClient } from '@supabase/supabase-js';
import { getDocumentLimit, type PlanName } from './plans';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface UsageData {
  userId: string;
  documentCount: number;
  limit: number;
  resetDate: Date;
  percentageUsed: number;
  canProcess: boolean;
}

// Get current usage for a user
export async function getUserUsage(userId: string): Promise<UsageData | null> {
  try {
    // Get user's subscription plan
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan_name')
      .eq('user_id', userId)
      .single();
    
    const planName = (subscription?.plan_name || 'free') as PlanName;
    const limit = getDocumentLimit(planName);
    
    // Get usage tracking
    const { data: usage } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!usage) {
      // Create initial usage record
      const resetDate = getNextResetDate();
      await supabase
        .from('usage_tracking')
        .insert({
          user_id: userId,
          document_count: 0,
          reset_date: resetDate.toISOString(),
        });
      
      return {
        userId,
        documentCount: 0,
        limit,
        resetDate,
        percentageUsed: 0,
        canProcess: true,
      };
    }
    
    const resetDate = new Date(usage.reset_date);
    const now = new Date();
    
    // Check if we need to reset the count
    if (now > resetDate) {
      const newResetDate = getNextResetDate();
      await supabase
        .from('usage_tracking')
        .update({
          document_count: 0,
          reset_date: newResetDate.toISOString(),
        })
        .eq('user_id', userId);
      
      return {
        userId,
        documentCount: 0,
        limit,
        resetDate: newResetDate,
        percentageUsed: 0,
        canProcess: true,
      };
    }
    
    const documentCount = usage.document_count || 0;
    const percentageUsed = (documentCount / limit) * 100;
    const canProcess = documentCount < limit;
    
    return {
      userId,
      documentCount,
      limit,
      resetDate,
      percentageUsed,
      canProcess,
    };
  } catch (error) {
    console.error('Error getting user usage:', error);
    return null;
  }
}

// Increment document count for a user
export async function incrementDocumentCount(
  userId: string,
  count: number = 1
): Promise<boolean> {
  try {
    const usage = await getUserUsage(userId);
    
    if (!usage || !usage.canProcess) {
      return false; // User has reached their limit
    }
    
    const newCount = usage.documentCount + count;
    
    // Check if the new count would exceed the limit
    if (newCount > usage.limit) {
      return false;
    }
    
    await supabase
      .from('usage_tracking')
      .update({ document_count: newCount })
      .eq('user_id', userId);
    
    return true;
  } catch (error) {
    console.error('Error incrementing document count:', error);
    return false;
  }
}

// Check if user can process documents
export async function canProcessDocuments(
  userId: string,
  documentCount: number = 1
): Promise<{ canProcess: boolean; reason?: string }> {
  const usage = await getUserUsage(userId);
  
  if (!usage) {
    return { 
      canProcess: false, 
      reason: 'Unable to retrieve usage data' 
    };
  }
  
  const wouldExceed = (usage.documentCount + documentCount) > usage.limit;
  
  if (wouldExceed) {
    return {
      canProcess: false,
      reason: `This would exceed your monthly limit of ${usage.limit} documents. Upgrade to process more.`,
    };
  }
  
  return { canProcess: true };
}

// Get next reset date (first day of next month)
function getNextResetDate(): Date {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth;
}

// Get usage warning level
export function getUsageWarningLevel(percentageUsed: number): 'safe' | 'warning' | 'critical' | 'exceeded' {
  if (percentageUsed >= 100) return 'exceeded';
  if (percentageUsed >= 80) return 'critical';
  if (percentageUsed >= 60) return 'warning';
  return 'safe';
}

// Get formatted usage message
export function getUsageMessage(usage: UsageData): string {
  const warningLevel = getUsageWarningLevel(usage.percentageUsed);
  
  switch (warningLevel) {
    case 'exceeded':
      return `You've used all ${usage.limit} documents this month. Upgrade to continue processing.`;
    case 'critical':
      return `You've used ${usage.documentCount} of ${usage.limit} documents (${Math.round(usage.percentageUsed)}%). Consider upgrading.`;
    case 'warning':
      return `You've used ${usage.documentCount} of ${usage.limit} documents this month.`;
    default:
      return `${usage.documentCount} of ${usage.limit} documents used this month.`;
  }
}
