import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shown as "Last updated" in the footer.
  env: { BUILD_DATE: new Date().toISOString() },
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
