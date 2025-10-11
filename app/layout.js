// File: app/layout.js

import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://foldera.ai'),
  title: "Foldera – Stop Babysitting Your AI",
  description: "Foldera remembers, detects, and fixes costly mistakes while you sleep.",
  icons: {
    icon: [
      { url: '/foldera-glyph.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/foldera-glyph.svg', type: 'image/svg+xml' },
    ],
  },
  openGraph: {
    title: "Foldera – Stop Babysitting Your AI",
    description: "Foldera remembers, detects, and fixes costly mistakes while you sleep.",
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
    title: "Foldera – Stop Babysitting Your AI",
    description: "Foldera remembers, detects, and fixes costly mistakes while you sleep.",
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
        {children}
      </body>
    </html>
  );
}