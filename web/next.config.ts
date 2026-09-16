import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
