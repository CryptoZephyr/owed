import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { actor } from "@/lib/owed/auth";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Owed",
  description: "Every interviewed candidate hears back by a set date, or gets paid for their time through PayPal.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await actor();
  return (
    <html lang="en">
      <body>
        <header>
          <nav aria-label="Main"><Link href="/">Owed</Link> <Link href="/employer">Employer</Link> <Link href="/candidate">Candidate</Link></nav>
          {user && <form action={logoutAction}><p>Signed in as {user.name}</p><button type="submit">Sign out</button></form>}
          <p>PayPal sandbox. No real money.</p>
        </header>
        {children}
      </body>
    </html>
  );
}
