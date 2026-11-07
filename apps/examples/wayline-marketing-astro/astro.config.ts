import { defineConfig } from 'astro/config'

// The docs site serves the build from `/web-components/demo/<id>/` (apps/ui/scripts/sync-examples.mjs), so the base
// must match or every asset 404s on GitHub Pages while working in dev.
export default defineConfig({
  base: '/web-components/demo/wayline-marketing-astro',
  outDir: 'dist',
  output: 'static',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  server: { host: '127.0.0.1', port: 4184 },
})
