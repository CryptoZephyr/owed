export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main>
      <h1>Owed</h1>
      {error && <p role="alert">{error}</p>}
      <p>Every interviewed candidate hears back by a set date, or gets paid for their time through PayPal.</p>
      <p>This is an early build for the PayPal AI Hackathon and runs against the PayPal sandbox only.</p>
      <p><a href="/auth/paypal?returnTo=/employer">Continue as an employer with PayPal</a></p>
      <p><a href="/auth/paypal?returnTo=/candidate">Continue as a candidate with PayPal</a></p>
      <p>Employers fund one hold for each role and share a private invitation with each interviewed candidate.
        Candidates connect a verified PayPal account to receive the full guarantee if the employer misses their deadline.</p>
    </main>
  );
}
