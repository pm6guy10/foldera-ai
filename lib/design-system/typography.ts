/**
 * Foldera Design System - Typography
 * 
 * Using Inter for UI, GeistMono for data
 */

export const typography = {
  // Headlines
  display: 'font-semibold text-4xl tracking-tight',
  h1: 'font-semibold text-2xl tracking-tight',
  h2: 'font-medium text-xl tracking-tight',
  h3: 'font-medium text-lg',
  h4: 'font-medium text-base',
  
  // Body
  body: 'text-base leading-relaxed',
  bodySmall: 'text-sm leading-relaxed',
  caption: 'text-xs leading-normal',
  
  // Data/Mono
  mono: 'font-mono text-sm',
  monoSmall: 'font-mono text-xs',
  
  // Special
  label: 'text-xs font-medium uppercase tracking-wider',
  stat: 'font-semibold text-3xl tabular-nums',
} as const;

export const fontFamily = {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['GeistMono', 'Menlo', 'monospace'],
};

