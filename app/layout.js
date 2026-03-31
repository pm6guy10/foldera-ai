// File: app/layout.js

import "./globals.css";
import { Inter } from "next/font/google";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://foldera.ai'),
  title: {
    default: "Foldera — Finished work, every morning",
    template: "%s — Foldera",
  },
  description: "Foldera ingests your chaos, computes conviction, and delivers executable actions. You just approve or skip.",
  icons: {
    icon: [
      { url: '/foldera-glyph.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/foldera-glyph.svg', type: 'image/svg+xml' },
    ],
  },
  openGraph: {
    title: "Foldera — Finished work, every morning",
    description: "Foldera ingests your chaos, computes conviction, and delivers executable actions. You just approve or skip.",
    images: [
      {
        url: '/foldera-hero.svg',
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
    description: "Foldera ingests your chaos, computes conviction, and delivers executable actions. You just approve or skip.",
    images: ['/foldera-hero.svg'],
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
      <head>
        <link rel="icon" href="/foldera-glyph.svg" type="image/svg+xml" />
      </head>
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}