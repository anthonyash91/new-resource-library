import type { NextConfig } from "next";
import { join } from "path";

/** Absolute project root — prevents Next.js from walking up to ~/package-lock.json */
const projectRoot = join(__dirname);

const nextConfig: NextConfig = {
  // Dev and production must never share the same cache (avoids missing chunk errors).
  distDir: process.env.NODE_ENV === "production" ? ".next" : ".next-dev",
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  webpack: (config) => {
    config.context = projectRoot;
    return config;
  },
};

export default nextConfig;
