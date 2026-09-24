import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/web-components/demo/observability-nextjs',
  trailingSlash: true,
  images: { unoptimized: true },
}

export default nextConfig
