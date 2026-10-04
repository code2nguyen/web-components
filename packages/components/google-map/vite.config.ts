import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: [
        'src/google-map.ts',
        'src/google-map-marker.ts',
        'src/google-map-route.ts',
        'src/google-street-view.ts',
        'src/google-maps-element.ts',
        'src/google-maps-loader.ts',
        'src/map-child.ts',
        'src/geo.ts',
      ],
      formats: ['es'],
    },
    minify: false,
    rollupOptions: {
      external: /^lit|@c2n/,
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      // The untagged base is analysed too, or the map and street view lose the `api-key`, `map-error` and parts it declares.
      // `src/google-map.ts` comes first: the MCP registry advertises `elements[0]` as the package's import example.
      files: ['src/google-map.ts', 'src/google-map-marker.ts', 'src/google-map-route.ts', 'src/google-street-view.ts', 'src/google-maps-element.ts'],
      lit: true,
      output: '../custom-elements.json',
      plugins: [customLitCemPlugin()],
    }),
  ],
})
