/** @type {import('next').NextConfig} */
const nextConfig = {
  // The catalog and docs live above this directory, shared with the Python gateway
  // that still owns data/*.json. Tracing them keeps a standalone build self-contained.
  outputFileTracingRoot: new URL('..', import.meta.url).pathname,
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
