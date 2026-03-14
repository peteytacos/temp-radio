import type { NextConfig } from "next";
import { execSync } from "child_process";

const buildNumber = (() => {
  try {
    // Count commits to generate incrementing build number
    const count = execSync("git rev-list --count HEAD").toString().trim();
    return String(count).padStart(3, "0");
  } catch {
    return "000";
  }
})();

const nextConfig: NextConfig = {
  // Only use static export for production builds, not dev server
  ...(process.env.NODE_ENV === "production" ? { output: "export" as const } : {}),
  env: {
    NEXT_PUBLIC_BUILD_NUMBER: buildNumber,
  },
};

export default nextConfig;
