import { NextResponse } from 'next/server';
import { autopilotEngine } from '@/lib/autopilot-engine';

export async function POST(request: Request) {
  try {
    const { actionId, userId, parameters = {} } = await request.json();

    if (!actionId) {
      return NextResponse.json({ error: 'Action ID required' }, { status: 400 });
    }

    // Execute the action through the Autopilot Engine
    const result = await autopilotEngine.executeAction(actionId, parameters);

    // Log the execution for compliance and learning
    await autopilotEngine.logExecution({
      actionId,
      userId,
      timestamp: new Date().toISOString(),
      result: 'success',
      parameters
    });

    return NextResponse.json({
      success: true,
      action_executed: actionId,
      result: result,
      timestamp: new Date().toISOString(),
      message: 'Action executed successfully'
    });

  } catch (error: any) {
    console.error('Autopilot execution error:', error);

    // Log failed executions too
    await autopilotEngine.logExecution({
      actionId: request.body?.actionId,
      userId: request.body?.userId,
      timestamp: new Date().toISOString(),
      result: 'failed',
      error: error.message
    });

    return NextResponse.json({
      error: 'Failed to execute action',
      details: error.message
    }, { status: 500 });
  }
}

// Extend the AutopilotEngine with execution methods
autopilotEngine.executeAction = async function(actionId, parameters) {
  // Find the action in the queue
  const action = this.executionQueue.find(a => a.id === actionId);

  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  // Execute the action
  const result = await action.executable();

  // Remove from queue after execution
  this.executionQueue = this.executionQueue.filter(a => a.id !== actionId);

  return result;
};

autopilotEngine.logExecution = async function(executionData) {
  // In production, log to database for compliance and analytics
  console.log('🚀 AUTOPILOT EXECUTION:', executionData);

  // Track metrics
  this.executionMetrics = this.executionMetrics || {};
  this.executionMetrics.totalExecutions = (this.executionMetrics.totalExecutions || 0) + 1;
  this.executionMetrics.successfulExecutions = (this.executionMetrics.successfulExecutions || 0) + (executionData.result === 'success' ? 1 : 0);
};

// Add execution methods to the engine
autopilotEngine.calendarAPI = {
  moveEvent: async (eventId, newTime) => {
    console.log(`📅 Moving event ${eventId} to ${newTime}`);
    return { success: true, newTime };
  }
};

autopilotEngine.emailAPI = {
  send: async (emailData) => {
    console.log(`📧 Sending email:`, emailData);
    return { success: true, messageId: 'msg_123' };
  }
};

autopilotEngine.slackAPI = {
  post: async (postData) => {
    console.log(`💬 Posting to Slack:`, postData);
    return { success: true, messageId: 'slack_123' };
  },
  alert: async (channel, message) => {
    console.log(`🚨 Alerting ${channel}: ${message}`);
    return { success: true };
  }
};

autopilotEngine.tasksAPI = {
  create: async (taskData) => {
    console.log(`✅ Creating task:`, taskData);
    return { success: true, taskId: 'task_123' };
  }
};

autopilotEngine.auditLog = {
  record: async (logData) => {
    console.log(`📋 Audit log:`, logData);
    return { success: true };
  }
};

autopilotEngine.stripeAPI = {
  applyCoupon: async (customerId, couponCode) => {
    console.log(`💳 Applying coupon ${couponCode} to ${customerId}`);
    return { success: true };
  }
};
