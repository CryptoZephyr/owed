import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: { "/**": ["./supabase/certs/prod-ca-2021.crt"] },
  async redirects() {
    return [{
      source: "/docs/start/why-owed",
      destination: "/docs/start/introduction",
      permanent: true,
    }];
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
