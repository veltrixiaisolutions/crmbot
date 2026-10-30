/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backendUrl = process.env.INTERNAL_BACKEND_URL || "http://127.0.0.1:8040";
    return [
      {
        source: "/auth/:path*",
        destination: `${backendUrl}/auth/:path*`,
      },
      {
        source: "/tenants/:path*",
        destination: `${backendUrl}/tenants/:path*`,
      },
      {
        source: "/knowledge/:path*",
        destination: `${backendUrl}/knowledge/:path*`,
      },
      {
        source: "/conversations/:path*",
        destination: `${backendUrl}/conversations/:path*`,
      },
      {
        source: "/users/:path*",
        destination: `${backendUrl}/users/:path*`,
      },
      {
        source: "/webhook",
        destination: `${backendUrl}/webhook`,
      },
      {
        source: "/meta/:path*",
        destination: `${backendUrl}/meta/:path*`,
      },
      {
        source: "/health",
        destination: `${backendUrl}/health`,
      },
      {
        source: "/docs",
        destination: `${backendUrl}/docs`,
      },
      {
        source: "/openapi.json",
        destination: `${backendUrl}/openapi.json`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
