import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: ['src/float-button.ts', 'src/float-button-action.ts'],
      formats: ['es'],
    },
    minify: false,
    rollupOptions: {
      external: /^lit|@c2n/,
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      files: ['src/float-button.ts', 'src/float-button-action.ts'],
      lit: true,
      output: '../custom-elements.json',
      plugins: [customLitCemPlugin()],
    }),
  ],
})
