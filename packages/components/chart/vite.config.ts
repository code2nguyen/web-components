import { defineConfig } from 'vite'
import VitePluginCustomElementsManifest from 'vite-plugin-cem'
import { customLitCemPlugin } from '../../../scripts/cem-plugin-customize/index'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: Object.fromEntries(
        [
          'src/chart.ts',
          'src/line-chart.ts',
          'src/area-chart.ts',
          'src/bar-chart.ts',
          'src/sparkline.ts',
          'src/pie-chart.ts',
          'src/gauge-chart.ts',
          'src/radar-chart.ts',
          'src/pyramid-chart.ts',
          'src/scatter-chart.ts',
          'src/bubble-chart.ts',
          'src/candlestick-chart.ts',
          'src/overlap-chart.ts',
          'src/overlap-layout.ts',
          'src/map-chart.ts',
          'src/map-layer.ts',
          'src/map-scale.ts',
          'src/maps/map-source.ts',
          'src/maps/world-110m.ts',
          'src/maps/world-50m.ts',
          'src/maps/us-states.ts',
          'src/chart-series.ts',
          'src/chart-legend.ts',
          'src/chart-tooltip.ts',
          'src/chart-base.ts',
          'src/uplot-chart-base.ts',
          'src/echarts-chart-base.ts',
          'src/chart-types.ts',
          'src/chart-adapter.ts',
          'src/chart-theme.ts',
          'src/chart-data.ts',
        ].map((file) => [file.replace(/^src\//, '').replace(/\.ts$/, ''), file]),
      ),
      formats: ['es'],
    },
    minify: false,
    rollupOptions: {
      // `uplot` and `echarts` are peer dependencies reached through a dynamic import; the `^echarts`
      // branch also covers the `echarts/core`, `/charts`, `/components` and `/renderers` subpaths.
      // `@upsetjs/venn.js` is a regular dependency of the overlap chart, and `d3-geo` and `topojson-client` of the map
      // chart, resolved by the consumer's bundler. The world-atlas and us-atlas outlines are bundled into
      // `dist/maps/*.js`: they are build inputs, not dependencies.
      external: /^(lit|@lit\/context|@c2n|@upsetjs|uplot|echarts|d3-geo|topojson-client)/,
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
        'src/gauge-chart.ts',
        'src/radar-chart.ts',
        'src/pyramid-chart.ts',
        'src/scatter-chart.ts',
        'src/bubble-chart.ts',
        'src/candlestick-chart.ts',
        'src/overlap-chart.ts',
        'src/map-chart.ts',
        'src/map-layer.ts',
        'src/chart-series.ts',
        'src/chart-legend.ts',
        'src/chart-tooltip.ts',
        'src/chart-link.ts',
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
