import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictSolver, WorkSignal } from '@/lib/intelligence/conflict-detector';
import OpenAI from 'openai';

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    })),
  };
});

describe('ConflictSolver', () => {
  let mockOpenAI: any;

  beforeEach(() => {
    mockOpenAI = new OpenAI({ apiKey: 'test-key' });
  });

  it('should detect Gmail + Outlook calendar conflict', async () => {
    const signals: WorkSignal[] = [
      {
        id: 'gmail:123',
        type: 'calendar_event',
        source: 'gmail',
        datetime: '2024-01-15T09:00:00Z',
        content: 'Team standup meeting',
        author: 'team@example.com',
      },
      {
        id: 'outlook:456',
        type: 'calendar_event',
        source: 'outlook',
        datetime: '2024-01-15T09:00:00Z',
        content: 'Client presentation',
        author: 'client@example.com',
      },
    ];

    // Mock OpenAI response
    mockOpenAI.chat.completions.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              conflicts: [
                {
                  type: 'scheduling_conflict',
                  severity: 'high',
                  signals_involved: ['gmail:123', 'outlook:456'],
                  summary: 'Double booking detected',
                  recommended_action: 'Reschedule one of the meetings',
                  datetime: '2024-01-15T09:00:00Z',
                },
              ],
            }),
          },
        },
      ],
    });

    const conflicts = await ConflictSolver.detect(signals, mockOpenAI);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('scheduling_conflict');
    expect(conflicts[0].signals_involved).toContain('gmail:123');
    expect(conflicts[0].signals_involved).toContain('outlook:456');
  });

  it('should detect scheduling conflicts using time-based detection', () => {
    const signals: WorkSignal[] = [
      {
        id: 'gmail:123',
        type: 'calendar_event',
        source: 'gmail',
        datetime: '2024-01-15T09:00:00Z',
      },
      {
        id: 'outlook:456',
        type: 'calendar_event',
        source: 'outlook',
        datetime: '2024-01-15T09:00:00Z',
      },
    ];

    const conflicts = ConflictSolver.detectSchedulingConflicts(signals);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('scheduling_conflict');
    expect(conflicts[0].severity).toBe('high');
  });

  it('should return empty array when no conflicts found', () => {
    const signals: WorkSignal[] = [
      {
        id: 'gmail:123',
        type: 'calendar_event',
        source: 'gmail',
        datetime: '2024-01-15T09:00:00Z',
      },
      {
        id: 'gmail:456',
        type: 'calendar_event',
        source: 'gmail',
        datetime: '2024-01-15T10:00:00Z',
      },
    ];

    const conflicts = ConflictSolver.detectSchedulingConflicts(signals);

    expect(conflicts).toHaveLength(0);
  });

  it('should handle signals without datetime', () => {
    const signals: WorkSignal[] = [
      {
        id: 'gmail:123',
        type: 'email',
        source: 'gmail',
        content: 'Some email content',
      },
    ];

    const conflicts = ConflictSolver.detectSchedulingConflicts(signals);

    expect(conflicts).toHaveLength(0);
  });
});

