import type { NextConfig } from "next";
import { execSync } from "child_process";

const gitHash = (() => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
})();

const nextConfig: NextConfig = {
  // Only use static export for production builds, not dev server
  ...(process.env.NODE_ENV === "production" ? { output: "export" as const } : {}),
  env: {
    NEXT_PUBLIC_BUILD_ID: gitHash,
  },
};

export default nextConfig;
