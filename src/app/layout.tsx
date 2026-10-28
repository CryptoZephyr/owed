import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { actor } from "@/lib/owed/auth";
import { Header } from "@/components/Header";
import "./tokens.css";
import "./fonts.css";
import "./globals.css";

const plexSans = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2", weight: "600" },
  ],
  variable: "--font-plex-sans",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const newsreader = localFont({
  src: "../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2",
  weight: "200 800",
  variable: "--font-newsreader",
  fallback: ["Georgia", "Times New Roman", "serif"],
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  title: "Owed",
  description: "Every interviewed candidate hears back by a set date, or gets paid for their time through PayPal.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await actor();
  return (
    <html lang="en" className={`${plexSans.variable} ${newsreader.variable}`}>
      <body>
        <Header user={user} />
        {children}
      </body>
    </html>
  );
}
