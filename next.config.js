/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ignore old Vite routes under src/pages (.tsx) while migrating to Next app router.
  pageExtensions: ["next.js", "next.jsx", "next.ts", "next.tsx"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
