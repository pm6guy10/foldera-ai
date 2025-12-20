// =====================================================
// INNGEST API ROUTE
// Handles Inngest webhooks and function invocations
// =====================================================

import { serve } from 'inngest/next';
import { inngest, analyzeOutlook, analyzeGmail, generateDailyBriefing } from '@/inngest/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    analyzeOutlook,
    analyzeGmail,
    generateDailyBriefing,
  ],
});

