/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Main app: prevent clickjacking by default.
        source: "/((?!embed).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'",
          },
        ],
      },
      {
        // Embed route: explicitly allow any parent to iframe it. This is the
        // intended public embed surface. Clickjacking is not a concern here
        // because the embed page itself has no destructive actions.
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
      {
        source: "/embed",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
