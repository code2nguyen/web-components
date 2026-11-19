// Server side of `hydration.spec.ts`, loaded in Node through Vite's SSR loader: renders the tag input to the
// declarative shadow DOM a server (Astro's Lit integration) sends. Like that integration, it shims `customElements` only.
import { customElements } from '@lit-labs/ssr-dom-shim'
import { render } from '@lit-labs/ssr'
import { collectResultSync } from '@lit-labs/ssr/lib/render-result.js'
import { html } from 'lit'

/** Three tags and a slotted remove icon: the server cannot read the slot, so it draws the built-in cross. */
export async function renderTagInput(): Promise<string> {
  globalThis.customElements ??= customElements
  await import('../src/tag-input')
  return collectResultSync(
    render(
      html`<c2-tag-input aria-label="Recipients" value="ann@example.com;bob@example.com;cy@example.com"
        ><svg slot="remove-icon" class="custom-remove" viewBox="0 0 24 24"><path d="M3 6h18"></path></svg
      ></c2-tag-input>`,
    ),
  )
}
