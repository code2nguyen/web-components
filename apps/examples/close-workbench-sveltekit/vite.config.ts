import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // SvelteKit 3 reads its configuration from the plugin; there is no svelte.config.js.
    sveltekit({
      // Every route is prerendered into dist/, which apps/ui/scripts/sync-examples.mjs copies into the docs site.
      adapter: adapter({ pages: 'dist' }),
      // Served from the docs site under /demo/<id>/, in an iframe.
      paths: { base: '/web-components/demo/close-workbench-sveltekit' },
      compilerOptions: {
        // Svelte cannot know that a custom element is interactive: `<c2-button onclick>` is a real button inside its
        // shadow root, with the keyboard handling and the role, so these two checks do not apply to `c2-*` tags.
        warningFilter: (warning) =>
          !(
            (warning.code === 'a11y_click_events_have_key_events' || warning.code === 'a11y_no_static_element_interactions') &&
            warning.message.includes('`<c2-')
          ),
      },
    }),
  ],
  build: {
    // `#lib/c2n.ts` registers every element the app uses in one chunk (~175 kB gzipped), loaded once before hydration.
    chunkSizeWarningLimit: 800,
  },
})
