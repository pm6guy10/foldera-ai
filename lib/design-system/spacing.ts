/**
 * Foldera Design System - Spacing & Layout
 */

export const spacing = {
  // Page layout
  page: {
    padding: 'px-6 py-8 lg:px-8 lg:py-10',
    maxWidth: 'max-w-7xl mx-auto',
  },
  
  // Card spacing
  card: {
    padding: 'p-6',
    paddingCompact: 'p-4',
    gap: 'gap-4',
  },
  
  // Section spacing
  section: {
    marginTop: 'mt-8',
    gap: 'gap-6',
  },
  
  // Component spacing
  stack: {
    xs: 'space-y-1',
    sm: 'space-y-2',
    md: 'space-y-4',
    lg: 'space-y-6',
    xl: 'space-y-8',
  },
  
  inline: {
    xs: 'space-x-1',
    sm: 'space-x-2',
    md: 'space-x-4',
    lg: 'space-x-6',
  },
} as const;

export const radius = {
  none: 'rounded-none',
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  full: 'rounded-full',
} as const;

