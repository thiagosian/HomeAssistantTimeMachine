import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.INGRESS_ENTRYPOINT || "",
  devIndicators: {
    buildActivity: false,
  },
};

export default nextConfig;