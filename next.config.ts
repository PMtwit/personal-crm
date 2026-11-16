import type { NextConfig } from "next";

// End-to-end tests run their own server next to the main one. It needs a
// separate build folder, and a tsconfig that only extends the main one:
// Next.js leaves such a config untouched instead of rewriting tsconfig.json
const isE2eServer = process.env.E2E_SERVER === "1";

// The Docker image runs the minimal standalone server. Only there:
// with this option "next start" warns that it does not work
const isDockerBuild = process.env.DOCKER_BUILD === "1";

// React needs eval only in development, to rebuild server error stacks in the
// browser. The built app never uses it
const isDev = process.env.NODE_ENV === "development";

// Everything the pages load comes from the app itself. No nonces: Next.js
// inline scripts and styles are allowed with 'unsafe-inline'.
// No upgrade-insecure-requests: the server is reached over https anyway
// (nginx redirects, HSTS), and on local http it would break loading
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Set by the app, not by nginx, so they go along with every response,
// on both the test stand and prod
const securityHeaders = [
  // No preload: it needs the whole pmcrm.site domain and a request to the browsers' lists
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // For old browsers; new ones follow frame-ancestors above
  { key: "X-Frame-Options", value: "DENY" },
  // Search words and names travel in the app's URLs: other sites get nothing.
  // Not no-referrer: with it browsers send "Origin: null" on POST, and both
  // Server Actions and Better Auth reject such requests
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The app uses none of these
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  ...(isDockerBuild && { output: "standalone" }),
  // No "x-powered-by: Next.js": the app does not name its software
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
