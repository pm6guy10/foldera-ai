'use client';

import { useState } from 'react';
import { Briefing, BriefingItem } from '@/lib/briefing/types';

interface BriefingCardProps {
  briefing: Briefing | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export function BriefingCard({ briefing, isLoading, onRefresh }: BriefingCardProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4" />
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
        </div>
      </div>
    );
  }
  
  if (!briefing) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">No Briefing Available</h2>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Generate Briefing
        </button>
      </div>
    );
  }
  
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">{briefing.title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{briefing.subtitle}</p>
        </div>
        <button
          onClick={onRefresh}
          className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>
      
      <div className="space-y-6">
        {/* Summary */}
        <div className="p-4 bg-gray-50 dark:bg-slate-900 rounded-lg">
          <p className="text-sm">{briefing.summary}</p>
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <StatBox label="Critical" value={briefing.stats.criticalItems} variant="danger" />
          <StatBox label="Actions" value={briefing.stats.actionItems} variant="warning" />
          <StatBox label="Healthy" value={briefing.stats.healthyRelationships} variant="success" />
          <StatBox label="At Risk" value={briefing.stats.atRiskRelationships} variant="danger" />
        </div>
        
        {/* Sections */}
        {!briefing.criticalAlerts.isEmpty && (
          <BriefingSection 
            section={briefing.criticalAlerts}
            isExpanded={expandedSection === 'critical'}
            onToggle={() => setExpandedSection(expandedSection === 'critical' ? null : 'critical')}
          />
        )}
        
        {!briefing.actionRequired.isEmpty && (
          <BriefingSection 
            section={briefing.actionRequired}
            isExpanded={expandedSection === 'action'}
            onToggle={() => setExpandedSection(expandedSection === 'action' ? null : 'action')}
          />
        )}
        
        {!briefing.relationshipUpdates.isEmpty && (
          <BriefingSection 
            section={briefing.relationshipUpdates}
            isExpanded={expandedSection === 'relationships'}
            onToggle={() => setExpandedSection(expandedSection === 'relationships' ? null : 'relationships')}
          />
        )}
        
        {!briefing.radarContext.isEmpty && (
          <BriefingSection 
            section={briefing.radarContext}
            isExpanded={expandedSection === 'radar'}
            onToggle={() => setExpandedSection(expandedSection === 'radar' ? null : 'radar')}
          />
        )}
      </div>
    </div>
  );
}

function StatBox({ 
  label, 
  value, 
  variant 
}: { 
  label: string; 
  value: number; 
  variant: 'success' | 'warning' | 'danger' 
}) {
  const colors = {
    success: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20',
    warning: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20',
    danger: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20',
  };
  
  return (
    <div className={`p-3 rounded-lg text-center ${colors[variant]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

function BriefingSection({
  section,
  isExpanded,
  onToggle,
}: {
  section: { title: string; items: BriefingItem[] };
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700 rounded-t-lg"
      >
        <span className="font-medium">{section.title}</span>
        <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-slate-600 rounded">
          {section.items.length}
        </span>
      </button>
      
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
          {section.items.map(item => (
            <div key={item.id} className="p-4 flex items-start gap-3">
              <span className="text-xl">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{item.title}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {item.description}
                </div>
                {item.hasAction && (
                  <button className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    {item.actionLabel || 'Take Action'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

