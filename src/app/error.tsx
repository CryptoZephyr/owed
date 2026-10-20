"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main><h1>Owed could not load this page</h1><p>Check the database setup or contact the operator. No replacement payment has been created.</p><button onClick={reset}>Try again</button></main>;
}
