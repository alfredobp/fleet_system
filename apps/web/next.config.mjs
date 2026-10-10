/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig = {
  output: 'export',
  basePath: isGithubPages ? '/fleet_system' : '',
  images: {
    unoptimized: true
  },
  transpilePackages: ['@fleet/types']
};

export default nextConfig;
