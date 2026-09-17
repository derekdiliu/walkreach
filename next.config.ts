import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server.js with only the node_modules it uses, so the
  // production image does not carry the whole dependency tree.
  output: "standalone",
};

export default nextConfig;
