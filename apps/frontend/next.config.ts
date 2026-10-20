import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a self-contained server and a minimal
  // node_modules, which is what the container runtime stage copies. Without this
  // the standalone output does not exist and the frontend image build fails.
  output: "standalone",
  // The dev server only trusts `localhost` and the hostname it started with.
  // Compose publishes the frontend on 127.0.0.1, so the browser's HMR websocket
  // (`/_next/hmr`) is a cross-origin request and is blocked without this entry.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
