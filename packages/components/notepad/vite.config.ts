import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: ['src/notepad.ts'],
      formats: ['es'],
    },
    minify: false,
    // A data: URL from `?inline` stays one string in its own chunk (font-data), loaded only when the face is used.
    assetsInlineLimit: Number.POSITIVE_INFINITY,
    rollupOptions: {
      // ProseMirror is a regular dependency: an app that already ships it (or two notepads from two bundles) shares one copy.
      external: /^(lit|@c2n|prosemirror-)/,
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      files: ['src/notepad.ts'],
      lit: true,
      output: '../custom-elements.json',
      plugins: [customLitCemPlugin()],
    }),
  ],
})
