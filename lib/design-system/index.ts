export * from './colors';
export * from './typography';
export * from './spacing';
export * from './animations';

// Utility function to combine classes
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

