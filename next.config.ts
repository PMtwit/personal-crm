import type { NextConfig } from "next";

// End-to-end tests run their own server next to the main one. It needs a
// separate build folder, and a tsconfig that only extends the main one:
// Next.js leaves such a config untouched instead of rewriting tsconfig.json
const isE2eServer = process.env.E2E_SERVER === "1";

const nextConfig: NextConfig = {
  ...(isE2eServer && {
    distDir: ".next-e2e",
    typescript: { tsconfigPath: "tsconfig.e2e.json" },
  }),
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
