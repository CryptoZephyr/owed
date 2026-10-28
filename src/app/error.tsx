"use client";

import { Button } from "@/components/Button";
import { Notice } from "@/components/Notice";
import { PlainFooter } from "@/components/Footer";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <>
    <main>
      <h1>This page didn&apos;t load</h1>
      <Notice kind="error" title="Owed couldn't reach its database or PayPal">No payment was created or repeated because of this. Try again in a minute. If it keeps happening, contact the operator.</Notice>
      <div className="actions"><Button type="button" onPress={reset}>Try again</Button></div>
    </main>
    <PlainFooter />
  </>;
}
