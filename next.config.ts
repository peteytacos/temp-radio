import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only use static export for production builds, not dev server
  ...(process.env.NODE_ENV === "production" ? { output: "export" as const } : {}),
};

export default nextConfig;
