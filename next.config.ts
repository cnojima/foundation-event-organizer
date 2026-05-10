import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // discord.js pulls in optional native deps (zlib-sync, bufferutil, etc.)
  // that Next's bundler can't resolve. Marking it external makes Next leave
  // it alone and let Node's runtime resolver handle it.
  serverExternalPackages: ["discord.js"],
};

export default withNextIntl(nextConfig);
