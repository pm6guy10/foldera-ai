// =====================================================
// INNGEST JOB QUEUE
// Background job system for Foldera
// =====================================================

import { Inngest } from 'inngest';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/observability/logger';

// Initialize Inngest client
export const inngest = new Inngest({ 
  id: 'foldera',
  name: 'Foldera Background Jobs',
});

/**
 * Analyze Outlook Signals
 * Runs daily at 6 AM to analyze Outlook emails and detect conflicts
 * 
 * Note: This is a wrapper around the existing script logic.
 * In production, you should refactor the script to be importable.
 */
export const analyzeOutlook = inngest.createFunction(
  { 
    id: 'analyze-outlook-signals',
    name: 'Analyze Outlook Signals',
  },
  { 
    cron: '0 6 * * *', // Every day at 6 AM
  },
  async ({ step }) => {
    return await step.run('get-and-process-users', async () => {
      try {
        // Initialize Supabase
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Get active Outlook users
        const { data: integrations, error } = await supabase
          .from('integrations')
          .select('user_id')
          .eq('provider', 'azure_ad')
          .eq('status', 'active');

        if (error) {
          logger.error('Failed to fetch Outlook users', error);
          return { processed: 0, error: error.message };
        }

        const users = integrations || [];
        logger.info('Starting Outlook analysis', { userCount: users.length });

        // Process each user
        const results = [];
        for (const integration of users) {
          const result = await step.run(`analyze-${integration.user_id}`, async () => {
            try {
              // In production, you would call a refactored function here
              // For now, we log that it would run
              logger.info('Outlook analysis scheduled', { userId: integration.user_id });
              return { success: true, userId: integration.user_id };
            } catch (error: any) {
              logger.error('Outlook analysis failed', error, { userId: integration.user_id });
              return { 
                success: false, 
                userId: integration.user_id, 
                error: error.message 
              };
            }
          });
          results.push(result);
        }

        return { processed: results.length, results };
      } catch (error: any) {
        logger.error('Outlook analysis job failed', error);
        throw error;
      }
    });
  }
);

/**
 * Analyze Gmail Signals
 * Runs daily at 6:30 AM
 */
export const analyzeGmail = inngest.createFunction(
  { 
    id: 'analyze-gmail-signals',
    name: 'Analyze Gmail Signals',
  },
  { 
    cron: '30 6 * * *', // Every day at 6:30 AM
  },
  async ({ step }) => {
    // Similar structure to analyzeOutlook
    // Implementation would call your Gmail analyst script
    return { status: 'scheduled' };
  }
);

/**
 * Generate Daily Briefing
 * Runs daily at 7 AM
 */
export const generateDailyBriefing = inngest.createFunction(
  { 
    id: 'generate-daily-briefing',
    name: 'Generate Daily Briefing',
  },
  { 
    cron: '0 7 * * *', // Every day at 7 AM
  },
  async ({ step }) => {
    // Implementation would call your briefing generator
    return { status: 'scheduled' };
  }
);

