import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ['better-sqlite3'],
  async redirects() {
    return [
      { source: '/UNIVA Assistant.dc.html', destination: '/assistant', permanent: true },
      { source: '/UNIVA%20Assistant.dc.html', destination: '/assistant', permanent: true },
      { source: '/UNIVA Landing v3.dc.html', destination: '/', permanent: true },
      { source: '/UNIVA%20Landing%20v3.dc.html', destination: '/', permanent: true },
    ];
  },
};

export default nextConfig;
