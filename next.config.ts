import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["xlsx", "jszip"],
  outputFileTracingIncludes: { "/*": ["./lib/spreadsheets/worker.cjs", "./node_modules/xlsx/**/*", "./node_modules/jszip/**/*"] },
  experimental: {
    proxyClientMaxBodySize: "128kb",
    serverActions: {
      bodySizeLimit: "128kb",
    },
  },
};

export default nextConfig;
