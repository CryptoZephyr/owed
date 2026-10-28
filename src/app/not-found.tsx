import Link from "next/link";
import { PlainFooter } from "@/components/Footer";

export default function NotFound() {
  return <>
    <main>
      <div className="page-head"><h1>This link isn&apos;t available</h1>
        <p className="measure">If an employer sent you a private invitation, it may have been replaced by a newer link, or it was sent to a different PayPal account. Ask them for the latest link, and sign in with the PayPal account it was sent to.</p></div>
      <p><Link href="/">Go to the Owed home page</Link></p>
    </main>
    <PlainFooter />
  </>;
}
