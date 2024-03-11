import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: 'src/details.ts',
      formats: ['es'],
    },
    minify: false,
    rollupOptions: {
      external: /^lit|@c2n/,
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      files: ['src/details.ts'],
      lit: true,
      output: '../custom-elements.json',
    }),
  ],
})
