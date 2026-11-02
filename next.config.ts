import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: { "/**": ["./supabase/certs/prod-ca-2021.crt"] },
  async redirects() {
    return [
      { source: "/docs/start/introduction", destination: "/docs/get-started/introduction", permanent: true },
      { source: "/docs/start/how-it-works", destination: "/docs/get-started/how-it-works", permanent: true },
      { source: "/docs/start/try-owed", destination: "/docs/get-started/quickstart", permanent: true },
      { source: "/docs/start/why-owed", destination: "/docs/get-started/introduction", permanent: true },
      { source: "/docs/using/create-a-role", destination: "/docs/guides/create-a-role", permanent: true },
      { source: "/docs/using/fund-the-hold", destination: "/docs/guides/fund-the-hold", permanent: true },
      { source: "/docs/using/invite-candidates", destination: "/docs/guides/invite-candidates", permanent: true },
      { source: "/docs/using/claim-a-guarantee", destination: "/docs/guides/claim-a-guarantee", permanent: true },
      { source: "/docs/using/send-closure", destination: "/docs/guides/send-closure", permanent: true },
      { source: "/docs/using/deadline-and-payout", destination: "/docs/guides/deadline-and-payout", permanent: true },
      { source: "/docs/using/close-the-role", destination: "/docs/guides/close-the-role", permanent: true },
      { source: "/docs/using/recovery", destination: "/docs/guides/recovery", permanent: true },
      { source: "/docs/architecture/how-the-money-is-held", destination: "/docs/concepts/how-the-money-is-held", permanent: true },
      { source: "/docs/architecture/sign-in-and-identity", destination: "/docs/concepts/sign-in-and-identity", permanent: true },
      { source: "/docs/architecture/what-happens-at-the-deadline", destination: "/docs/concepts/what-happens-at-the-deadline", permanent: true },
      { source: "/docs/architecture/never-charged-twice", destination: "/docs/security/failure-and-recovery", permanent: true },
      { source: "/docs/architecture/ai-and-emails", destination: "/docs/concepts/ai-and-emails", permanent: true },
      { source: "/docs/reference/amounts-and-limits", destination: "/docs/reference/fees-and-limits", permanent: true },
      { source: "/docs/reference/environments", destination: "/docs/reference/supported", permanent: true },
      { source: "/docs/reference/fees", destination: "/docs/reference/fees-and-limits", permanent: true },
      { source: "/docs/security/authorization-boundaries", destination: "/docs/security/permissions", permanent: true },
      { source: "/docs/security/replay-protection", destination: "/docs/security/failure-and-recovery", permanent: true },
      { source: "/docs/security/recovery-and-controls", destination: "/docs/security/failure-and-recovery", permanent: true },
      { source: "/docs/security/privacy", destination: "/docs/security/data-and-privacy", permanent: true },
      { source: "/docs/proof/live-deployment", destination: "/docs/evidence/live-deployment", permanent: true },
      { source: "/docs/proof/verified-sandbox-transactions", destination: "/docs/evidence/verified-examples", permanent: true },
      { source: "/docs/proof/full-example", destination: "/docs/evidence/verified-examples", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
    ] }];
  },
};

const withMDX = createMDX({
  options: { remarkPlugins: ["remark-frontmatter"] },
});

export default withMDX(nextConfig);
