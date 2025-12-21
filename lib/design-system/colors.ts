/**
 * Foldera Design System - Color Palette
 * 
 * Philosophy: Calm professionalism with strategic accent use
 */

export const colors = {
  // Core palette (dark mode first)
  background: {
    primary: 'bg-zinc-950',      // Main background
    secondary: 'bg-zinc-900',    // Cards, elevated surfaces
    tertiary: 'bg-zinc-800',     // Hover states, borders
    accent: 'bg-zinc-800/50',    // Subtle highlights
  },
  
  // Text
  text: {
    primary: 'text-zinc-50',     // Headlines, primary content
    secondary: 'text-zinc-400',  // Supporting text
    muted: 'text-zinc-500',      // Tertiary, timestamps
    inverse: 'text-zinc-950',    // On light backgrounds
  },
  
  // Semantic colors (for signals)
  status: {
    critical: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
      dot: 'bg-red-500',
    },
    warning: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      dot: 'bg-amber-500',
    },
    success: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      dot: 'bg-emerald-500',
    },
    info: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      text: 'text-blue-400',
      dot: 'bg-blue-500',
    },
    neutral: {
      bg: 'bg-zinc-500/10',
      border: 'border-zinc-500/20',
      text: 'text-zinc-400',
      dot: 'bg-zinc-500',
    },
  },
  
  // Accent (use sparingly)
  accent: {
    primary: 'bg-violet-600',
    primaryHover: 'hover:bg-violet-500',
    secondary: 'bg-violet-600/10',
    text: 'text-violet-400',
  },
  
  // Borders
  border: {
    subtle: 'border-zinc-800',
    medium: 'border-zinc-700',
    strong: 'border-zinc-600',
  },
} as const;

// Light mode overrides (for email templates, etc.)
export const lightColors = {
  background: {
    primary: 'bg-white',
    secondary: 'bg-zinc-50',
    tertiary: 'bg-zinc-100',
  },
  text: {
    primary: 'text-zinc-900',
    secondary: 'text-zinc-600',
    muted: 'text-zinc-500',
  },
} as const;

