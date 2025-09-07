// File: app/layout.js

import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Bulldog PRA Autopilot",
  description: "Litigation intelligence assistant for PRA enforcement",
  
  // Instructs the browser UI to be dark
  themeColor: "#0a0a0f",

  // Tells the app to draw behind the system navigation bar
  viewport: {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover', // This is essential
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}