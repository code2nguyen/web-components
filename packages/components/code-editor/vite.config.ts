import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: ['src/code-editor.ts', 'src/engine.ts'],
      formats: ['es'],
    },
    minify: false,
    rollupOptions: {
      // CodeMirror is an optional peer reached only through dynamic `import()`, so it must stay external: bundling
      // it would put the whole engine back in the package and defeat the point of the peer.
      external: /^(lit|@c2n|@codemirror|@lezer|codemirror)/,
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      files: ['src/code-editor.ts'],
      lit: true,
      output: '../custom-elements.json',
      plugins: [customLitCemPlugin()],
    }),
  ],
})
