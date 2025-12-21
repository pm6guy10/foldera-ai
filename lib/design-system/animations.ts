/**
 * Foldera Design System - Animations
 * 
 * Subtle, professional, never distracting
 */

// Tailwind animation classes
export const transitions = {
  fast: 'transition-all duration-150 ease-out',
  base: 'transition-all duration-200 ease-out',
  slow: 'transition-all duration-300 ease-out',
  colors: 'transition-colors duration-200 ease-out',
} as const;

// Framer Motion variants
export const motionVariants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
  },
  
  slideUp: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  
  slideIn: {
    initial: { opacity: 0, x: -10 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 10 },
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.15, ease: 'easeOut' },
  },
  
  stagger: {
    animate: {
      transition: {
        staggerChildren: 0.05,
      },
    },
  },
  
  // For lists
  listItem: {
    initial: { opacity: 0, x: -10 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.2 },
  },
  
  // Pulse for live indicators
  pulse: {
    animate: {
      scale: [1, 1.05, 1],
      opacity: [1, 0.8, 1],
    },
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// CSS keyframe animations (add to tailwind.config.js)
export const keyframes = {
  shimmer: {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
  fadeIn: {
    '0%': { opacity: '0' },
    '100%': { opacity: '1' },
  },
  slideUp: {
    '0%': { opacity: '0', transform: 'translateY(10px)' },
    '100%': { opacity: '1', transform: 'translateY(0)' },
  },
};

