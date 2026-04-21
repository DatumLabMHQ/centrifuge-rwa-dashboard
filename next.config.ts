import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Pin Turbopack's root to this project. Without this, Next 16 infers the
  // workspace root by walking up the file tree; if sibling dashboard
  // projects share a parent folder, it can pick the wrong root and then
  // fail to resolve `tailwindcss` (and friends) from our local
  // node_modules.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
