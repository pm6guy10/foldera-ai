'use client';

import { forwardRef, HTMLAttributes } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/design-system';
import { motionVariants } from '@/lib/design-system/animations';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  variant?: 'default' | 'elevated' | 'bordered' | 'interactive';
  glow?: 'none' | 'subtle' | 'accent';
  animate?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = 'default', glow = 'none', animate = true, children, ...props }, ref) => {
    const baseStyles = 'rounded-xl backdrop-blur-sm';
    
    const variantStyles = {
      default: 'bg-zinc-900/80 border border-zinc-800',
      elevated: 'bg-zinc-900/90 border border-zinc-700 shadow-xl shadow-black/20',
      bordered: 'bg-transparent border border-zinc-700',
      interactive: 'bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/80 cursor-pointer transition-all duration-200',
    };
    
    const glowStyles = {
      none: '',
      subtle: 'shadow-lg shadow-zinc-900/50',
      accent: 'shadow-lg shadow-violet-500/10 border-violet-500/20',
    };
    
    const Component = (animate ? motion.div : 'div') as any;
    const animationProps = animate ? motionVariants.fadeIn : {};
    
    return (
      <Component
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], glowStyles[glow], className)}
        {...animationProps}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

GlassCard.displayName = 'GlassCard';

