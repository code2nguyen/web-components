import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: ['src/page-editor.ts'],
      formats: ['es'],
    },
    minify: false,
    rollupOptions: {
      // ProseMirror and shiki are regular dependencies, shared with an app (or a c2-notepad) that ships them too.
      external: /^(lit|@c2n|prosemirror-|shiki)/,
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      files: ['src/page-editor.ts'],
      lit: true,
      output: '../custom-elements.json',
      plugins: [customLitCemPlugin()],
    }),
  ],
})
