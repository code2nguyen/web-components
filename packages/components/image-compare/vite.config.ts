import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  // The dev harness shows the docs site's sample images (`/images/…`); a build copies nothing.
  publicDir: command === 'serve' ? '../../../apps/ui/public' : false,
  build: {
    lib: {
      entry: ['src/image-compare.ts'],
      formats: ['es'],
    },
    minify: false,
    rollupOptions: {
      external: /^lit|@c2n/,
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      files: ['src/image-compare.ts'],
      lit: true,
      output: '../custom-elements.json',
      plugins: [customLitCemPlugin()],
    }),
  ],
}))
