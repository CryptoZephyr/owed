import type { Metadata } from "next";
import type { ReactNode } from "react";
import { actor } from "@/lib/owed/auth";
import { Header } from "@/components/Header";
import "./tokens.css";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Owed",
  description: "Every interviewed candidate hears back by a set date, or gets paid for their time through PayPal.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await actor();
  return (
    <html lang="en">
      <body>
        <Header user={user} />
        {children}
      </body>
    </html>
  );
}
