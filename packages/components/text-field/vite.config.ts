import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: {
        'text-field': 'src/text-field.ts',
        'text-field-clear': 'src/text-field-clear.ts',
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    minify: false,
    rollupOptions: {
      external: /^lit|@c2n/,
      output: {
        // The two entries share the TextField class; keep the shared chunk out of the dist root.
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      files: ['src/text-field.ts', 'src/text-field-clear.ts'],
      lit: true,
      output: '../custom-elements.json',
      plugins: [customLitCemPlugin()],
    }),
  ],
})
