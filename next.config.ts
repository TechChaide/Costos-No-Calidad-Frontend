import { environment } from '@/environments/environments.prod';
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {

  basePath: environment.basePath,

  output: 'standalone',

  // Solo desarrollo: permite abrir `next dev` desde otros equipos de la red (por IP).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*', '*.chaide.com', '*.industria.chaide.com'],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Solo desarrollo: proxy hacia el API local de costos (/api-costos/api/coq/... -> {COSTOS_API_PROXY_TARGET}/api/coq/...).
  // En producción el navegador llama directo a apiCostosURL (ver environments.prod.ts).
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    const target = process.env.COSTOS_API_PROXY_TARGET || 'http://localhost:5400';
    return [{ source: '/api-costos/:path*', destination: `${target}/:path*` }];
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
