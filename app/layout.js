// File: app/layout.js

import "./globals.css";
import { BuildMarker } from "@/components/BuildMarker";
import { resolveCanonicalSiteOrigin } from "@/lib/site-canonical";

const siteOrigin = resolveCanonicalSiteOrigin();

export const metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: "Foldera — Finished work, every morning",
    template: "%s — Foldera",
  },
  description:
    "Foldera turns scattered inboxes, calendar holds, stale drafts, and unresolved threads into one directive, draft, and source trail every morning.",
  keywords: [
    "AI email assistant",
    "email productivity",
    "daily briefing",
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
    title: "Foldera — Finished work, every morning",
    description:
      "Foldera turns scattered inboxes, calendar holds, stale drafts, and unresolved threads into one directive, draft, and source trail every morning.",
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
    title: "Foldera — Finished work, every morning",
    description:
      "Foldera turns scattered inboxes, calendar holds, stale drafts, and unresolved threads into one directive, draft, and source trail every morning.",
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
    <html lang="en">
      <body className="font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-cyan-500 focus:text-black focus:rounded-lg focus:font-black focus:text-xs focus:uppercase"
        >
          Skip to main content
        </a>
        {children}
        <BuildMarker />
      </body>
    </html>
  );
}
