/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",   // (if you still use pages/)
  ],
  theme: {
    extend: {
      colors: {
        bg: "#020617",          // dark background
        panel: "#0f172a",       // slightly lighter panels
        border: "#334155",      // slate border
        text: {
          primary: "#f1f5f9",   // main text
          secondary: "#94a3b8", // muted text
        },
        accent: "#22d3ee",      // cyan accent
      },
    },
  },
  plugins: [],
}