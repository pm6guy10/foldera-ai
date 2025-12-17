import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { autopilotEngine } from '@/lib/autopilot-engine';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accessToken, timeRange = '7d' } = await request.json();

    if (!accessToken) {
      return NextResponse.json({ error: 'Access token required' }, { status: 401 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/calendar/callback`
    );
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Get time range for analysis
    const now = new Date();
    const timeMin = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(); // Yesterday
    const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // Next 7 days

    // Fetch calendar events
    const eventsResponse = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100
    });

    const events = eventsResponse.data.items || [];

    // Find conflicts and insights
    const conflicts = findCalendarConflicts(events);
    const insights = generateCalendarInsights(events);

    // Generate executable actions using Autopilot Engine
    const executableActions = await autopilotEngine.generateExecutableActions(conflicts);

    return NextResponse.json({
      success: true,
      events_analyzed: events.length,
      time_range: `${timeMin.split('T')[0]} to ${timeMax.split('T')[0]}`,
      calendar_conflicts: conflicts,
      calendar_insights: insights,
      executable_actions: executableActions,
      autopilot_ready: {
        actions_available: executableActions.length,
        can_execute: executableActions.length > 0,
        autonomy_level: 'PREPARE', // Start with prepare mode
        estimated_time_saved: executableActions.reduce((sum, action) => {
          const time = action.estimated_time?.match(/(\d+)/)?.[1] || '0';
          return sum + parseInt(time);
        }, 0)
      },
      summary: {
        total_conflicts: conflicts.length,
        critical_conflicts: conflicts.filter(c => c.severity === 'critical').length,
        double_bookings: conflicts.filter(c => c.type === 'double_booking').length,
        missed_prep: conflicts.filter(c => c.type === 'missing_prep').length,
        overloaded_days: insights.filter(i => i.type === 'overloaded_day').length,
        executable_actions: executableActions.length
      }
    });

  } catch (error: any) {
    console.error('Calendar analysis error:', error);
    return NextResponse.json({
      error: 'Failed to analyze calendar',
      details: error.message
    }, { status: 500 });
  }
}

function findCalendarConflicts(events: any[]) {
  const conflicts: any[] = [];

  // 1. DOUBLE BOOKINGS - Same time, different events
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const event1 = events[i];
      const event2 = events[j];

      if (eventsOverlap(event1, event2)) {
        conflicts.push({
          type: 'double_booking',
          severity: 'critical',
          title: 'Double-Booked Meeting',
          description: `${event1.summary} overlaps with ${event2.summary}`,
          time: formatEventTime(event1),
          conflicting_events: [event1.summary, event2.summary],
          business_impact: 'Missed meetings, poor preparation, stakeholder frustration',
          recommended_action: `Reschedule one of these events or delegate attendance`,
          value_saved: '$500+ in stakeholder relationship damage'
        });
      }
    }
  }

  // 2. MISSING PREP TIME - Important meetings without buffer
  events.forEach(event => {
    if (isHighImportanceEvent(event)) {
      const hasPrepTime = hasPreparationBuffer(event, events);
      if (!hasPrepTime) {
        conflicts.push({
          type: 'missing_prep',
          severity: 'warning',
          title: 'No Preparation Time',
          description: `${event.summary} has no buffer for preparation`,
          time: formatEventTime(event),
          business_impact: 'Poor meeting quality, missed opportunities, rushed decisions',
          recommended_action: `Block 30-60 minutes before this meeting for preparation`,
          value_saved: '$200+ in meeting effectiveness'
        });
      }
    }
  });

  // 3. BACK-TO-BACK MEETINGS - No breaks
  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];

    if (eventsAreConsecutive(current, next) && !hasBreakTime(current, next)) {
      conflicts.push({
        type: 'back_to_back',
        severity: 'warning',
        title: 'Back-to-Back Meetings',
        description: `No break between ${current.summary} and ${next.summary}`,
        time: `${formatEventTime(current)} → ${formatEventTime(next)}`,
        business_impact: 'Burnout, poor focus, reduced meeting quality',
        recommended_action: `Add 15-minute buffer between these meetings`,
        value_saved: '$100+ in productivity improvement'
      });
    }
  }

  return conflicts;
}

function generateCalendarInsights(events: any[]) {
  const insights: any[] = [];

  // 1. OVERLOADED DAYS - Too many meetings
  const dailyEvents = groupEventsByDay(events);
  Object.entries(dailyEvents).forEach(([date, dayEvents]) => {
    if ((dayEvents as any[]).length > 6) { // More than 6 hours of meetings
      insights.push({
        type: 'overloaded_day',
        severity: 'warning',
        title: `Overloaded Day: ${new Date(date).toLocaleDateString()}`,
        description: `${(dayEvents as any[]).length} meetings scheduled - consider rescheduling`,
        business_impact: 'Reduced productivity, burnout risk, poor work quality',
        recommended_action: `Move ${(dayEvents as any[]).length - 4} meetings to other days`,
        value_saved: `$${Math.round(((dayEvents as any[]).length - 4) * 100)} in productivity gains`
      });
    }
  });

  // 2. WEEKEND WORK - Events on weekends
  const weekendEvents = events.filter(event =>
    new Date(event.start.dateTime || event.start.date).getDay() >= 6
  );

  if (weekendEvents.length > 0) {
    insights.push({
      type: 'weekend_work',
      severity: 'info',
      title: 'Weekend Work Detected',
      description: `${weekendEvents.length} events scheduled on weekends`,
      business_impact: 'Work-life balance issues, potential burnout',
      recommended_action: 'Consider moving non-essential work to weekdays',
      value_saved: 'Improved work-life balance and reduced burnout risk'
    });
  }

  // 3. MEETING-FREE DAYS - Check for focus time
  const workDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  workDays.forEach(day => {
    const dayEvents = (dailyEvents[new Date().toISOString().split('T')[0]] || []) as any[];
    if (dayEvents.length === 0) {
      insights.push({
        type: 'focus_time',
        severity: 'info',
        title: `Available Focus Time: ${day}`,
        description: `No meetings scheduled - perfect for deep work`,
        business_impact: 'Opportunity for high-value, focused work',
        recommended_action: 'Block this time for strategic planning or complex tasks',
        value_saved: '$300+ in focused productivity'
      });
    }
  });

  return insights;
}

// Helper functions
function eventsOverlap(event1: any, event2: any): boolean {
  const start1 = new Date(event1.start.dateTime || event1.start.date);
  const end1 = new Date(event1.end.dateTime || event1.end.date);
  const start2 = new Date(event2.start.dateTime || event2.start.date);
  const end2 = new Date(event2.end.dateTime || event2.end.date);

  return start1 < end2 && start2 < end1;
}

function eventsAreConsecutive(event1, event2) {
  const end1 = new Date(event1.end.dateTime || event1.end.date);
  const start2 = new Date(event2.start.dateTime || event2.start.date);

  const diffMinutes = (start2.getTime() - end1.getTime()) / (1000 * 60);
  return diffMinutes >= 0 && diffMinutes <= 15; // Within 15 minutes
}

function hasBreakTime(event1: any, event2: any): boolean {
  const end1 = new Date(event1.end.dateTime || event1.end.date);
  const start2 = new Date(event2.start.dateTime || event2.start.date);

  const diffMinutes = (start2.getTime() - end1.getTime()) / (1000 * 60);
  return diffMinutes >= 15; // At least 15 minutes break
}

function isHighImportanceEvent(event: any): boolean {
  const summary = (event.summary || '').toLowerCase();
  const importantKeywords = ['board', 'client', 'investor', 'executive', 'quarterly', 'annual'];
  return importantKeywords.some(keyword => summary.includes(keyword));
}

function hasPreparationBuffer(event: any, allEvents: any[]): boolean {
  const eventStart = new Date(event.start.dateTime || event.start.date);
  const bufferTime = new Date(eventStart.getTime() - 30 * 60 * 1000); // 30 minutes before

  // Check if there's a conflicting event in the buffer period
  return !allEvents.some(otherEvent => {
    if (otherEvent.id === event.id) return false;
    return eventsOverlap(
      { start: { dateTime: bufferTime.toISOString() }, end: { dateTime: eventStart.toISOString() } },
      otherEvent
    );
  });
}

function formatEventTime(event: any): string {
  const start = new Date(event.start.dateTime || event.start.date);
  return start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function groupEventsByDay(events: any[]): Record<string, any[]> {
  const dailyEvents: Record<string, any[]> = {};

  events.forEach(event => {
    const date = event.start.dateTime ?
      event.start.dateTime.split('T')[0] :
      event.start.date;

    if (!dailyEvents[date]) {
      dailyEvents[date] = [];
    }
    dailyEvents[date].push(event);
  });

  return dailyEvents;
}
