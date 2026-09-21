/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb"
    },
    serverComponentsExternalPackages: ["pdf-parse", "mammoth"]
  },
  // Next 14 also recognises this top-level key in newer minors
  serverExternalPackages: ["pdf-parse", "mammoth"]
};

export default nextConfig;
