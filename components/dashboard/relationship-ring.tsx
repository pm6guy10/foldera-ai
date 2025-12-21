'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/design-system';
import { typography } from '@/lib/design-system/typography';
import { RelationshipHealthSummary } from '@/lib/briefing/types';

interface RelationshipRingProps {
  relationships: RelationshipHealthSummary[];
}

export function RelationshipRing({ relationships }: RelationshipRingProps) {
  // Calculate distribution
  const total = relationships.length || 1;
  const atRisk = relationships.filter(r => r.healthScore < 40).length;
  const stable = relationships.filter(r => r.healthScore >= 40 && r.healthScore < 70).length;
  const thriving = relationships.filter(r => r.healthScore >= 70).length;
  
  const segments = [
    { label: 'Thriving', count: thriving, color: '#10b981', percent: (thriving / total) * 100 },
    { label: 'Stable', count: stable, color: '#f59e0b', percent: (stable / total) * 100 },
    { label: 'At Risk', count: atRisk, color: '#ef4444', percent: (atRisk / total) * 100 },
  ];
  
  // Create ring segments
  let offset = 0;
  const ringSegments = segments.map(seg => {
    const segment = {
      ...seg,
      offset,
      dashArray: `${seg.percent} ${100 - seg.percent}`,
    };
    offset += seg.percent;
    return segment;
  });
  
  return (
    <div className="space-y-6">
      {/* Ring Chart */}
      <div className="relative w-48 h-48 mx-auto">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          {ringSegments.map((seg, i) => (
            <motion.circle
              key={seg.label}
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke={seg.color}
              strokeWidth="4"
              strokeDasharray={seg.dashArray}
              strokeDashoffset={-seg.offset}
              initial={{ strokeDasharray: '0 100' }}
              animate={{ strokeDasharray: seg.dashArray }}
              transition={{ delay: i * 0.2, duration: 0.5, ease: 'easeOut' }}
              className="origin-center"
            />
          ))}
        </svg>
        
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn(typography.stat, 'text-zinc-50')}>
            {relationships.length}
          </span>
          <span className={cn(typography.caption, 'text-zinc-500')}>
            Total
          </span>
        </div>
      </div>
      
      {/* Legend */}
      <div className="space-y-2">
        {segments.map(seg => (
          <div 
            key={seg.label}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span className={cn(typography.bodySmall, 'text-zinc-300')}>
                {seg.label}
              </span>
            </div>
            <span className={cn(typography.mono, 'text-zinc-500')}>
              {seg.count}
            </span>
          </div>
        ))}
      </div>
      
      {/* At Risk List */}
      {atRisk > 0 && (
        <div className="pt-4 border-t border-zinc-800">
          <h4 className={cn(typography.label, 'text-zinc-500 mb-3')}>
            Needs Attention
          </h4>
          <div className="space-y-2">
            {relationships
              .filter(r => r.healthScore < 40)
              .slice(0, 3)
              .map(r => (
                <div 
                  key={r.contactEmail}
                  className="flex items-center gap-3 p-2 rounded-lg bg-red-500/5 border border-red-500/10"
                >
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                    <span className="text-xs font-medium">
                      {(r.contactName || r.contactEmail).slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(typography.bodySmall, 'text-zinc-300 truncate')}>
                      {r.contactName || r.contactEmail}
                    </p>
                    <p className={cn(typography.caption, 'text-red-400')}>
                      Score: {r.healthScore}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

