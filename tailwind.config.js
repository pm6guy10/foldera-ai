/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ─── Color palette — warm amber on warm near-black (issue #378 → app-wide). ─
      colors: {
        bg: "#0a0a0c",             // page background (warm near-black)
        panel: "#131318",          // card/panel background
        'panel-raised': "#1a1b21", // elevated panels, hover states
        border: {
          DEFAULT: "#26262d",      // default border (warm)
          subtle:  "#191920",      // subtle separator
          strong:  "#34343d",      // prominent border
        },
        text: {
          primary:   "#f5f6f8",    // headings
          secondary: "#c8ccd4",    // body / labels
          muted:     "#9aa0aa",    // placeholder / disabled
        },
        accent: {
          DEFAULT: "#f5a623",      // amber/gold — primary interactive accent
          hover:   "#ffc25c",      // bright amber hover state
          dim:     "#b4760f",      // deep amber accent
        },
        brand: {
          purple: "#b4760f",
          blue: "#b4760f",
        },
        warning: "#f59e0b",
        success: "#34d399",
        'demo-background': 'oklch(var(--demo-background) / <alpha-value>)',
        'demo-foreground': 'oklch(var(--demo-foreground) / <alpha-value>)',
        'demo-surface': {
          DEFAULT: 'oklch(var(--demo-surface) / <alpha-value>)',
          elevated: 'oklch(var(--demo-surface-elevated) / <alpha-value>)',
        },
        'demo-primary': {
          DEFAULT: 'oklch(var(--demo-primary) / <alpha-value>)',
          foreground: 'oklch(var(--demo-primary-foreground) / <alpha-value>)',
        },
        'demo-secondary': {
          DEFAULT: 'oklch(var(--demo-secondary) / <alpha-value>)',
          foreground: 'oklch(var(--demo-secondary-foreground) / <alpha-value>)',
        },
        'demo-muted': {
          DEFAULT: 'oklch(var(--demo-muted) / <alpha-value>)',
          foreground: 'oklch(var(--demo-muted-foreground) / <alpha-value>)',
        },
        'demo-accent': {
          DEFAULT: 'oklch(var(--demo-accent) / <alpha-value>)',
          foreground: 'oklch(var(--demo-accent-foreground) / <alpha-value>)',
        },
        'demo-attention': 'oklch(var(--demo-attention) / <alpha-value>)',
        'demo-success': 'oklch(var(--demo-success) / <alpha-value>)',
        'demo-destructive': {
          DEFAULT: 'oklch(var(--demo-destructive) / <alpha-value>)',
          foreground: 'oklch(var(--demo-destructive-foreground) / <alpha-value>)',
        },
        'demo-border': 'oklch(var(--demo-border) / <alpha-value>)',
        'demo-input': 'oklch(var(--demo-input) / <alpha-value>)',
        'demo-ring': 'oklch(var(--demo-ring) / <alpha-value>)',
        'demo-sidebar': {
          DEFAULT: 'oklch(var(--demo-sidebar) / <alpha-value>)',
          foreground: 'oklch(var(--demo-sidebar-foreground) / <alpha-value>)',
        },
      },

      // ─── Border radius — use rounded-xl (card) everywhere ──────────────
      borderRadius: {
        card:   '20px',
        badge:  '10px',
        button: '14px',
        pill:   '9999px', // rounded-full — pills, avatars
      },

      // ─── Typography ────────────────────────────────────────────────────
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'GeistMono', 'Menlo', 'monospace'],
      },

      // ─── Animations ────────────────────────────────────────────────────
      animation: {
        'shimmer':      'shimmer 2s linear infinite',
        'fade-in':      'fadeIn 0.2s ease-out',
        'slide-up':     'slideUp 0.2s ease-out',
        'pulse-slow':   'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-fast':   'pulseFast 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'gradient-x':   'gradientX 10s ease infinite',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseFast: {
          '0%, 100%': { opacity: '0.8', transform: 'scale(1)' },
          '50%':      { opacity: '1',   transform: 'scale(1.02)' },
        },
        gradientX: {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography'), require('tailwindcss-animate')],
}
