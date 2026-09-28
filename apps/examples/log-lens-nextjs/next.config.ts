import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/web-components/demo/log-lens-nextjs',
  trailingSlash: true,
  images: { unoptimized: true },
}

export default nextConfig
