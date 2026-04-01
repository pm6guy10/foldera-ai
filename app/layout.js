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
    icon: [{ url: '/foldera-glyph.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/foldera-glyph.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    title: "Foldera — Finished work, every morning",
    description: "Foldera ingests your chaos, computes conviction, and delivers executable actions. You just approve or skip.",
    images: [
      {
        url: 'https://www.foldera.ai/foldera-logo.png',
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
    images: ['https://www.foldera.ai/foldera-logo.png'],
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
      <body className={inter.className}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-cyan-500 focus:text-black focus:rounded-lg focus:font-black focus:text-xs focus:uppercase"
        >
          Skip to main content
        </a>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}