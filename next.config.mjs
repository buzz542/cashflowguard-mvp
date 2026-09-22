/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb"
    },
    serverComponentsExternalPackages: ["pdf-parse", "mammoth"]
  }
};

export default nextConfig;
