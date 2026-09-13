import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A real React 19 consumer of the published packages. Nothing about the components is special-cased here:
// they arrive as plain custom elements and Vite bundles them like any other dependency.
//
// `base` must match the deploy path (see apps/ui/scripts/sync-examples.mjs) — a wrong base works in dev
// and 404s on Pages.
export default defineConfig({
  base: '/web-components/demo/trading-dashboard-react/',
  plugins: [react()],
})
