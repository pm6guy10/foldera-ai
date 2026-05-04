'use client';

import { cn } from '@/lib/design-system';
import { colors } from '@/lib/design-system/colors';
import { motion } from 'framer-motion';

type StatusType = 'critical' | 'warning' | 'success' | 'info' | 'neutral';

interface StatusIndicatorProps {
  status: StatusType;
  label?: string;
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusIndicator({ 
  status, 
  label, 
  pulse = false,
  size = 'md' 
}: StatusIndicatorProps) {
  const statusColors = colors.status[status];
  
  const sizeStyles = {
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-3 w-3',
  };
  
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <motion.div
          className={cn('rounded-full', statusColors.dot, sizeStyles[size])}
          animate={pulse ? { 
            scale: [1, 1.2, 1],
            opacity: [1, 0.7, 1],
          } : undefined}
          transition={pulse ? {
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          } : undefined}
        />
        {pulse && (
          <div 
            className={cn(
              'absolute inset-0 rounded-full animate-ping',
              statusColors.dot,
              'opacity-50'
            )} 
          />
        )}
      </div>
      {label && (
        <span className={cn('text-sm font-medium', statusColors.text)}>
          {label}
        </span>
      )}
    </div>
  );
}

