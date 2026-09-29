import { readdirSync } from 'node:fs'
import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// One entry per generated symbol so consumers can import `@c2n/symbols/symbols/<name>.js`
// individually; the shared base class lands in a common chunk.
const symbolEntries = Object.fromEntries(
  readdirSync('src/symbols')
    .filter((file) => file.endsWith('.ts'))
    .map((file) => [`symbols/${file.replace(/\.ts$/, '')}`, `src/symbols/${file}`]),
)

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        symbol: 'src/symbol.ts',
        'symbol-names': 'src/symbol-names.ts',
        ...symbolEntries,
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    minify: false,
    rollupOptions: {
      external: /^lit|@c2n/,
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      files: ['src/symbol.ts', 'src/symbols/*.ts'],
      lit: true,
      output: '../custom-elements.json',
      plugins: [customLitCemPlugin()],
    }),
  ],
})
