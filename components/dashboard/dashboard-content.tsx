'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/design-system';
import { typography } from '@/lib/design-system/typography';
import { spacing } from '@/lib/design-system/spacing';
import { motionVariants } from '@/lib/design-system/animations';
import { GlassCard } from '@/components/ui/glass-card';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusBadge } from '@/components/ui/status-indicator';
import { SkeletonCard, SkeletonList } from '@/components/ui/skeleton';
import { SignalFeed } from './signal-feed';
import { RelationshipRing } from './relationship-ring';
import { Briefing } from '@/lib/briefing/types';

export default function DashboardContent() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    fetchBriefing();
  }, []);
  
  const fetchBriefing = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/briefing/generate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setBriefing(data.briefing);
      }
    } catch (error) {
      console.error('Failed to fetch briefing:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const stats = briefing?.stats;
  
  return (
    <motion.div 
      className={spacing.stack.lg}
      variants={motionVariants.stagger}
      initial="initial"
      animate="animate"
    >
      {/* Header */}
      <motion.div 
        className="flex justify-between items-start"
        variants={motionVariants.slideUp}
      >
        <div>
          <h1 className={cn(typography.h1, 'text-zinc-50')}>
            {getGreeting()}, Brandon
          </h1>
          <p className={cn(typography.body, 'text-zinc-400 mt-1')}>
            {briefing?.summary || 'Loading your daily briefing...'}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <StatusBadge status={stats?.criticalItems ? 'critical' : 'success'}>
            {stats?.criticalItems 
              ? `${stats.criticalItems} Critical` 
              : 'All Clear'}
          </StatusBadge>
          <button
            onClick={fetchBriefing}
            disabled={isLoading}
            className={cn(
              'px-4 py-2 rounded-lg',
              'bg-violet-600 hover:bg-violet-500',
              'text-white text-sm font-medium',
              'transition-colors duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isLoading ? 'Scanning...' : 'Run Scan'}
          </button>
        </div>
      </motion.div>
      
      {/* Metrics */}
      <motion.div 
        className="grid grid-cols-4 gap-4"
        variants={motionVariants.slideUp}
      >
        <MetricCard
          label="Critical Signals"
          value={stats?.criticalItems ?? '—'}
          status={stats?.criticalItems ? 'critical' : 'success'}
        />
        <MetricCard
          label="Action Items"
          value={stats?.actionItems ?? '—'}
          status={stats?.actionItems && stats.actionItems > 5 ? 'warning' : 'neutral'}
        />
        <MetricCard
          label="Healthy Relationships"
          value={stats?.healthyRelationships ?? '—'}
          status="success"
          change={stats ? { value: 12, direction: 'up' } : undefined}
        />
        <MetricCard
          label="At Risk"
          value={stats?.atRiskRelationships ?? '—'}
          status={stats?.atRiskRelationships ? 'warning' : 'neutral'}
        />
      </motion.div>
      
      {/* Main Grid */}
      <motion.div 
        className="grid grid-cols-3 gap-6"
        variants={motionVariants.slideUp}
      >
        {/* Signal Feed */}
        <div className="col-span-2">
          <GlassCard className="h-full">
            <div className="p-6 border-b border-zinc-800">
              <h2 className={cn(typography.h3, 'text-zinc-50')}>
                Live Signals
              </h2>
              <p className={cn(typography.caption, 'text-zinc-500 mt-1')}>
                Real-time updates from Shadow Mode
              </p>
            </div>
            <div className="p-6">
              {isLoading ? (
                <SkeletonList count={5} />
              ) : (
                <SignalFeed signals={briefing?.signals || []} />
              )}
            </div>
          </GlassCard>
        </div>
        
        {/* Relationship Ring */}
        <div>
          <GlassCard className="h-full">
            <div className="p-6 border-b border-zinc-800">
              <h2 className={cn(typography.h3, 'text-zinc-50')}>
                Relationship Health
              </h2>
            </div>
            <div className="p-6">
              {isLoading ? (
                <SkeletonCard />
              ) : (
                <RelationshipRing relationships={briefing?.relationships || []} />
              )}
            </div>
          </GlassCard>
        </div>
      </motion.div>
    </motion.div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

