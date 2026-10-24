import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: ['src/rich-text-editor.ts'],
      formats: ['es'],
    },
    minify: false,
    rollupOptions: {
      // ProseMirror is a regular dependency, shared with c2-page-editor and c2-notepad.
      external: /^(lit|@c2n|prosemirror-)/,
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      files: ['src/rich-text-editor.ts'],
      lit: true,
      output: '../custom-elements.json',
      plugins: [customLitCemPlugin()],
    }),
  ],
})
