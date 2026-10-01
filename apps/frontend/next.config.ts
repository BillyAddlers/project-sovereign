import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server and a minimal
  // node_modules, which is what the container runtime stage copies. Without this
  // the standalone output does not exist and the frontend image build fails.
  output: "standalone",
};

export default nextConfig;
