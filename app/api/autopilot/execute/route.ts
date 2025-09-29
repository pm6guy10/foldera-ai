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
    const body = await request.json().catch(() => ({}));
    await autopilotEngine.logExecution({
      actionId: body.actionId,
      userId: body.userId,
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
