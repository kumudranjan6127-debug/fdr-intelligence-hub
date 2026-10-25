import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
