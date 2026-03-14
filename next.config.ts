import type { NextConfig } from "next";
import { readFileSync } from "fs";

const buildNumber = (() => {
  try {
    const n = readFileSync("BUILD_NUMBER", "utf-8").trim();
    return String(n).padStart(3, "0");
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
