'use client';

import { cn } from '@/lib/design-system';
import { typography } from '@/lib/design-system/typography';
import { GlassCard } from './glass-card';
import { StatusIndicator } from './status-indicator';
import { motion } from 'framer-motion';

interface MetricCardProps {
  label: string;
  value: number | string;
  change?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  status?: 'critical' | 'warning' | 'success' | 'info' | 'neutral';
  icon?: React.ReactNode;
  subtitle?: string;
}

export function MetricCard({ 
  label, 
  value, 
  change, 
  status,
  icon,
  subtitle,
}: MetricCardProps) {
  const changeColors = {
    up: 'text-emerald-400',
    down: 'text-red-400',
    neutral: 'text-zinc-400',
  };
  
  const changeIcons = {
    up: '↑',
    down: '↓',
    neutral: '→',
  };
  
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className={cn(typography.label, 'text-zinc-500 mb-1')}>
            {label}
          </p>
          <motion.p 
            className={cn(typography.stat, 'text-zinc-50')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {value}
          </motion.p>
          {subtitle && (
            <p className={cn(typography.caption, 'text-zinc-500 mt-1')}>
              {subtitle}
            </p>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-2">
          {icon && (
            <div className="text-zinc-500">
              {icon}
            </div>
          )}
          {status && (
            <StatusIndicator status={status} pulse={status === 'critical'} />
          )}
        </div>
      </div>
      
      {change && (
        <div className={cn('mt-3 flex items-center gap-1', changeColors[change.direction])}>
          <span>{changeIcons[change.direction]}</span>
          <span className="text-sm font-medium">
            {Math.abs(change.value)}%
          </span>
          <span className="text-sm text-zinc-500">vs last week</span>
        </div>
      )}
    </GlassCard>
  );
}

