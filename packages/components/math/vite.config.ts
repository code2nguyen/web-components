import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: ['src/math.ts'],
      formats: ['es'],
    },
    minify: false,
    rollupOptions: {
      external: /^(lit|@c2n|temml)/,
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      files: ['src/math.ts'],
      lit: true,
      output: '../custom-elements.json',
      plugins: [customLitCemPlugin()],
    }),
  ],
})
