import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: ['src/color-area.ts'],
      formats: ['es'],
    },
    minify: false,
    rollupOptions: {
      external: /^lit|@c2n/,
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      files: ['src/color-area.ts'],
      lit: true,
      output: '../custom-elements.json',
    }),
  ],
})
