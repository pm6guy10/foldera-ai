'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/design-system';
import { typography } from '@/lib/design-system/typography';
import { transitions } from '@/lib/design-system/animations';
import { ShadowSignal } from '@/lib/shadow-mode/types';
import { StatusIndicator } from '@/components/ui/status-indicator';

interface SignalFeedProps {
  signals: ShadowSignal[];
}

export function SignalFeed({ signals }: SignalFeedProps) {
  if (signals.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">✨</div>
        <p className={cn(typography.body, 'text-zinc-400')}>
          All clear. No signals requiring attention.
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {signals.slice(0, 10).map((signal, index) => (
        <motion.div
          key={signal.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <SignalCard signal={signal} />
        </motion.div>
      ))}
    </div>
  );
}

function SignalCard({ signal }: { signal: ShadowSignal }) {
  const urgencyMap = {
    critical: 'critical',
    high: 'warning',
    medium: 'info',
    low: 'neutral',
    context: 'neutral',
  } as const;
  
  const status = urgencyMap[signal.urgency];
  
  return (
    <div className={cn(
      'p-4 rounded-lg border',
      'bg-zinc-900/50',
      'border-zinc-800 hover:border-zinc-700',
      transitions.base,
      'cursor-pointer'
    )}>
      <div className="flex items-start gap-3">
        <div className="text-2xl">{getSignalIcon(signal.type)}</div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={cn(typography.h4, 'text-zinc-50 truncate')}>
              {signal.title}
            </h4>
            <StatusIndicator 
              status={status} 
              size="sm"
              pulse={signal.urgency === 'critical'}
            />
          </div>
          
          <p className={cn(typography.bodySmall, 'text-zinc-400 line-clamp-2')}>
            {signal.description}
          </p>
          
          <div className="flex items-center gap-4 mt-3">
            {signal.contactEmail && (
              <span className={cn(typography.caption, 'text-zinc-500')}>
                {signal.contactName || signal.contactEmail}
              </span>
            )}
            <span className={cn(typography.caption, 'text-zinc-600')}>
              {formatTimeAgo(signal.detectedAt)}
            </span>
          </div>
        </div>
        
        {signal.draftMessage && (
          <button className={cn(
            'px-3 py-1.5 rounded-lg',
            'bg-violet-600/10 border border-violet-500/20',
            'text-violet-400 text-sm font-medium',
            transitions.colors,
            'hover:bg-violet-600/20'
          )}>
            View Draft
          </button>
        )}
      </div>
    </div>
  );
}

function getSignalIcon(type: ShadowSignal['type']): string {
  const icons: Record<string, string> = {
    commitment_made: '📝',
    commitment_received: '📥',
    deadline_approaching: '⏰',
    ghosting_risk: '👻',
    vip_escalation: '🔥',
    sentiment_shift: '😟',
    calendar_conflict: '📅',
    context_update: '💡',
  };
  return icons[type] || '📌';
}

function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

