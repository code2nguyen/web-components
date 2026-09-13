import { defineConfig } from 'vite'

// Every example is a real, standalone consumer of the published packages: its own Vite build, its own
// origin (the gallery embeds it in an iframe), its own copy of the custom element registry.
//
// `base` must match the deploy path — the docs site is served from https://code2nguyen.github.io/web-components
// and this build is copied verbatim out of `apps/ui/public/` (see apps/ui/scripts/sync-examples.mjs), so a
// wrong base works in dev and 404s on Pages.
export default defineConfig({
  base: '/web-components/demo/basic-form-html/',
})
