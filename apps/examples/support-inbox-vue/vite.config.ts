import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// A real Vue 3 consumer of the published packages. The one piece of configuration these components need is
// `isCustomElement`: without it the template compiler treats every `c2-*` tag as a Vue component, warns
// "Failed to resolve component" and renders nothing.
//
// `base` must match the deploy path (see apps/ui/scripts/sync-examples.mjs) — a wrong base works in dev
// and 404s on Pages.
export default defineConfig({
  base: '/web-components/demo/support-inbox-vue/',
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('c2-'),
        },
      },
    }),
  ],
})
