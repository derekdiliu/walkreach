import type { NextConfig } from "next";

// Everything the page loads is its own, apart from the basemap: the
// OpenFreeMap style, tiles, sprites and glyphs, or the OpenStreetMap raster
// tiles it falls back to. Next.js inlines its bootstrap scripts, hence
// 'unsafe-inline', and React needs eval in development only. MapLibre turns
// sprites into blob: images and runs its worker from public/.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "connect-src 'self' https://tiles.openfreemap.org https://tile.openstreetmap.org",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // A self-contained server.js with only the node_modules it uses, so the
  // production image does not carry the whole dependency tree.
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
