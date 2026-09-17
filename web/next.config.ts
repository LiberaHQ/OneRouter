import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native Node addon (a compiled .node binary) — it can't be
  // bundled by Turbopack/webpack and must use a native require() at runtime instead.
  serverExternalPackages: ["better-sqlite3"],
  async rewrites() {
    return {
      beforeFiles: [
        // /docs/{slug}.md serves raw markdown for agents — can't live as a page.tsx
        // sibling of /docs/{slug}, so it's aliased to a separate route tree.
        { source: "/docs/:slug.md", destination: "/docs-md/:slug" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
