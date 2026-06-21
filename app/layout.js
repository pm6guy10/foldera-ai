// File: app/layout.js

import "./globals.css";
import { Inter, Bricolage_Grotesque, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { resolveCanonicalSiteOrigin } from "@/lib/site-canonical";

// Body / UI — Inter (clean, proven).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Display / headings — Bricolage Grotesque (distinctive, editorial-premium; the
// "designed" signal per docs/DESIGN_SYSTEM.md §5).
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Mono — JetBrains Mono (eyebrows, labels, tabular data).
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Landing display — Space Grotesk (the imported "Foldera Landing" design face; scoped to the .fd landing layer).
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const fontVars = `${inter.variable} ${display.variable} ${mono.variable} ${grotesk.variable}`;

const siteOrigin = resolveCanonicalSiteOrigin();

export const metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: "Foldera — Stop rebuilding the work",
    template: "%s — Foldera",
  },
  description:
    "Foldera reconnects the message, meeting, draft, file, and blocker, then hands back the ready next move.",
  manifest: '/manifest.json',
  keywords: [
    "AI email assistant",
    "email productivity",
    "work context",
    "Gmail AI",
    "Outlook AI",
    "decision support",
  ],
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: '/foldera-glyph.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/foldera-glyph.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    title: "Foldera — Stop rebuilding the work",
    description:
      "Foldera reconnects the message, meeting, draft, file, and blocker, then hands back the ready next move.",
    url: siteOrigin,
    siteName: "Foldera",
    locale: "en_US",
    images: [
      {
        url: `${siteOrigin}/foldera-logo.png`,
        width: 1200,
        height: 630,
        alt: 'Foldera',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Foldera — Stop rebuilding the work",
    description:
      "Foldera reconnects the message, meeting, draft, file, and blocker, then hands back the ready next move.",
    images: [`${siteOrigin}/foldera-logo.png`],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={fontVars}>
      <body className="font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-accent focus:text-black focus:rounded-lg focus:font-black focus:text-xs focus:uppercase"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
