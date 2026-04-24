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
      // ─── Color palette — DO NOT CHANGE. Cyan/emerald accent decided. ───────
      colors: {
        bg: "#07090d",             // page background
        panel: "#0b0f14",          // card/panel background
        'panel-raised': "#121820", // elevated panels, hover states
        border: {
          DEFAULT: "#1b2530",      // default border
          subtle:  "#121922",      // subtle separator
          strong:  "#2a3948",      // prominent border
        },
        text: {
          primary:   "#e6e8eb",    // headings
          secondary: "#aeb7c2",    // body / labels
          muted:     "#7a8594",    // placeholder / disabled
        },
        accent: {
          DEFAULT: "#22d3ee",      // cyan — primary interactive accent
          hover:   "#67e8f9",      // bright cyan hover state
          dim:     "#0ea5e9",      // blue accent
        },
        brand: {
          purple: "#7c3aed",
          blue: "#0ea5e9",
        },
        warning: "#f59e0b",
        success: "#22c55e",
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
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['GeistMono', 'Menlo', 'monospace'],
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
  plugins: [require('@tailwindcss/typography')],
}
