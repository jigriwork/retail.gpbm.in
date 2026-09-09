import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["xlsx", "jszip"],
  outputFileTracingIncludes: { "/*": ["./lib/spreadsheets/worker.cjs", "./node_modules/xlsx/**/*", "./node_modules/jszip/**/*"] },
  experimental: {
    proxyClientMaxBodySize: "16mb",
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
