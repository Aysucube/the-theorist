import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // "use cache: remote" kept on the computer too, so a restarted app answers from disk (see the file).
  cacheHandlers: {
    remote: require.resolve("./cache-handlers/remote.js"),
  },
  // The desktop app ships the server on its own, with only the packages it uses, built apart
  // from the launcher's .next (see desktop/). Every image is unoptimized, so it leaves out sharp;
  // and never the data folder or the desktop app itself.
  ...(process.env.THEORIST_DESKTOP === "1" && {
    output: "standalone",
    distDir: "desktop-build",
    outputFileTracingIncludes: { "*": ["./cache-handlers/remote.js"] },
    outputFileTracingExcludes: { "*": ["node_modules/sharp/**", "node_modules/@img/**", ".data/**", "desktop/**", "desktop-build/cache/**"] },
  }),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing here is meant to be embedded in other sites.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
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
