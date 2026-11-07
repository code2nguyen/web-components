# Wayline marketing site (Astro)

A one-page landing site for a made-up integration platform, built as a static Astro site on `@c2n/components`. It is the "Marketing site" app from the roadmap: the first static, motion-heavy example, and the one that exercises `c2-marquee`, `c2-beam`, `c2-device-frame`, `c2-text-effect`, `c2-backdrop` and `c2-scroll-progress`.

```bash
npm run build -w apps/examples/wayline-marketing-astro         # type-check, then astro build into dist/
npm run dev -w apps/examples/wayline-marketing-astro           # astro dev on 127.0.0.1:4184
npm run test:browser -w apps/examples/wayline-marketing-astro  # Playwright against `astro preview` of the build
```

## How it uses the components

- **Plain custom elements, no framework islands.** Astro renders the `c2-*` tags as HTML and a bundled `<script>` registers them, which is all a custom element needs. No `@astrojs/lit` server rendering: the page is static and the elements upgrade on load.
- **Below the fold loads when it comes near.** `src/scripts/islands.ts` imports a component's module the first time a section that uses it nears the viewport, the plain-JavaScript counterpart of `client:visible`. Astro splits each `import()` into its own chunk, so the first load carries only the header and the hero. The sign-up dialog's modules load on the first press of a "Start free" button. `:not(:defined)` rules in `site.css` keep the unupgraded tags close to their final layout.
- **One theme import.** `import '@c2n/components/theme.css'` in the layout brings the tokens, dark mode and every component's mapping. The site's own CSS uses the same `--c2-theme--*` tokens, so the page and the components switch theme together. The docs site passes its theme through `?theme=`, applied before the first paint.
- **Restyled through variables only.** Buttons, cards, stats, the header and the marquees take their look from `--c2-*` variables on classes in `site.css`; nothing reaches into a shadow root.

## Things worth knowing

- **Astro writes boolean attributes on custom elements as strings.** `sticky` becomes `sticky="true"` and `reverse={false}` becomes `reverse="false"`. That works because `@c2n/core`'s property converter reads `"false"` as false; Lit's default converter would read any present attribute as true.
- **`astro preview` goes to the background under an AI coding agent.** Astro 7 detects one and backgrounds the server, so Playwright would see its web server exit. `playwright.config.ts` sets `ASTRO_PREVIEW_BACKGROUND`, the variable Astro sets for its own background server, to keep it in the foreground.
- **The base path must match the docs site.** `astro.config.ts` sets `base` to `/web-components/demo/wayline-marketing-astro`, where `apps/ui/scripts/sync-examples.mjs` publishes the build.

Wayline, its customers and every figure on the page are made up.
