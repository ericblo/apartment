import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/apartment",
  // The site lives under /apartment; send visitors who land on the bare domain there.
  async redirects() {
    return [{ source: "/", destination: "/apartment", basePath: false, permanent: false }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
