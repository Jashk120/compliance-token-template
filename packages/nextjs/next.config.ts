import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  reactStrictMode: true,
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  webpack: (config, { dev }) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    // @hiero-did-sdk/hcs@0.2.1 deep-imports "@hiero-ledger/sdk/lib/client/NodeClient",
    // a subpath that every @hiero-ledger/sdk 2.x release excludes from its "exports"
    // map. Webpack enforces "exports", so point that one specifier at the physical
    // file. The tsx CLI scripts get the same mapping from
    // scripts/hieroNodeClientLoader.mjs (Node's resolver, not webpack).
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, unknown>),
      "@hiero-ledger/sdk/lib/client/NodeClient": path.resolve(
        __dirname,
        "node_modules/@hiero-ledger/sdk/lib/client/NodeClient.js",
      ),
      "react-native-zstd": false,
      "react-native-quick-crypto": false,
      "zstd-napi": false,
    };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    if (dev) {
      config.watchOptions = {
        followSymlinks: true,
      };
      config.snapshot = { ...(config.snapshot as object), managedPaths: [] };
    }
    return config;
  },
};

module.exports = nextConfig;
