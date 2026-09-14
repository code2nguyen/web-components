import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: [
        'src/chart.ts',
        'src/line-chart.ts',
        'src/area-chart.ts',
        'src/bar-chart.ts',
        'src/sparkline.ts',
        'src/pie-chart.ts',
        'src/chart-series.ts',
        'src/chart-base.ts',
        'src/uplot-chart-base.ts',
        'src/echarts-chart-base.ts',
        'src/chart-types.ts',
        'src/chart-adapter.ts',
        'src/chart-theme.ts',
        'src/chart-data.ts',
      ],
      formats: ['es'],
    },
    minify: false,
    rollupOptions: {
      // `uplot` and `echarts` are peer dependencies reached through a dynamic import; the `^echarts`
      // branch also covers the `echarts/core`, `/charts`, `/components` and `/renderers` subpaths.
      external: /^(lit|@lit\/context|@c2n|uplot|echarts)/,
    },
  },
  plugins: [
    VitePluginCustomElementsManifest({
      // The abstract bases define no tag, but the analyzer only merges a superclass's attributes, slots,
      // events and CSS properties into a subclass when the superclass module is in the analyzed set.
      // Leave them out and every chart's manifest loses its entire shared surface.
      // `src/line-chart.ts` comes first among the tagged files because the MCP registry advertises
      // `elements[0]` as the package's import example.
      files: [
        'src/line-chart.ts',
        'src/area-chart.ts',
        'src/bar-chart.ts',
        'src/sparkline.ts',
        'src/pie-chart.ts',
        'src/chart-series.ts',
        'src/chart-base.ts',
        'src/uplot-chart-base.ts',
        'src/echarts-chart-base.ts',
      ],
      lit: true,
      output: '../custom-elements.json',
      plugins: [customLitCemPlugin()],
    }),
  ],
})
