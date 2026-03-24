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
        bg: "#020617",             // zinc-950 — page background
        panel: "#18181b",          // zinc-900 — card/panel background
        'panel-raised': "#27272a", // zinc-800 — elevated panels, hover states
        border: {
          DEFAULT: "#3f3f46",      // zinc-700 — default border
          subtle:  "#27272a",      // zinc-800 — subtle separator
          strong:  "#52525b",      // zinc-600 — prominent border
        },
        text: {
          primary:   "#fafafa",    // zinc-50 — headings
          secondary: "#a1a1aa",    // zinc-400 — body / labels
          muted:     "#52525b",    // zinc-600 — placeholder / disabled
        },
        accent: {
          DEFAULT: "#22d3ee",      // cyan-400 — primary interactive accent
          hover:   "#67e8f9",      // cyan-300 — hover state
          dim:     "#0e7490",      // cyan-700 — dark accent bg
        },
        success: "#10b981",        // emerald-500 — approve / positive
      },

      // ─── Border radius — use rounded-xl (card) everywhere ──────────────
      borderRadius: {
        card:   '12px',   // rounded-xl  — all cards and panels
        badge:  '6px',    // rounded-md  — badges, chips
        button: '8px',    // rounded-lg  — buttons
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
