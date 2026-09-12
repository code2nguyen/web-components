import { readdirSync } from 'node:fs'
import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// One entry per generated icon so consumers can import `@c2n/phosphor-icons/icons/<name>.js`
// individually; the shared base class lands in a common chunk.
const iconEntries = Object.fromEntries(
  readdirSync('src/icons')
    .filter((file) => file.endsWith('.ts'))
    .map((file) => [`icons/${file.replace(/\.ts$/, '')}`, `src/icons/${file}`]),
)

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        'phosphor-icon': 'src/phosphor-icon.ts',
        'icon-names': 'src/icon-names.ts',
        ...iconEntries,
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
      files: ['src/phosphor-icon.ts', 'src/icons/*.ts'],
      lit: true,
      output: '../custom-elements.json',
      plugins: [customLitCemPlugin()],
    }),
  ],
})
