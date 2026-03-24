import path from "node:path";
import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";

const repoRoot = path.resolve(__dirname, "../..");

loadEnv({ path: path.join(repoRoot, ".env") });
loadEnv({ path: path.join(repoRoot, ".env.local"), override: true });

const nextConfig: NextConfig = {
  transpilePackages: ["@hax/ai"],
  // experimental: {
  //   typedRoutes: true,
  // },
};

export default nextConfig;
