import litServer from '@astrojs/lit/server.js'
import * as parse5 from 'parse5'

// Astro emits its one-time island bootstrap (a `<style>` for `astro-island { display: contents }` and the `<script>`s
// that define it) in front of the first island it renders. Children render before their parent, so when that first
// island is a slotted child (`<c2-feather-arrow-up slot="send-icon">`), the bootstrap lands in the parent's named slot
// content, and `@astrojs/lit` stamps `slot="send-icon"` on every top-level element of that content, the bootstrap
// included. A component with `::slotted(*) { display: block }` then prints the stylesheet's text inside its shadow
// DOM. Assigning top-level style and script elements to a slot no component has keeps them out of every slot: they
// are not rendered, and a style or script works the same whether it is assigned or not. The parse mirrors the one
// `@astrojs/lit` does on the same named-slot strings; the default slot is passed through untouched, as it does.
const BOOTSTRAP_SLOT = 'astro-bootstrap'

function unslotStylesAndScripts(html) {
  const fragment = parse5.parseFragment(html)
  let changed = false
  for (const node of fragment.childNodes) {
    if ((node.tagName === 'style' || node.tagName === 'script') && !node.attrs.some(({ name }) => name === 'slot')) {
      node.attrs.push({ name: 'slot', value: BOOTSTRAP_SLOT })
      changed = true
    }
  }
  return changed ? parse5.serialize(fragment) : html
}

export default {
  ...litServer,
  renderToStaticMarkup(Component, props, slots, metadata) {
    const safeSlots =
      slots &&
      Object.fromEntries(Object.entries(slots).map(([name, value]) => [name, name !== 'default' && value ? unslotStylesAndScripts(`${value}`) : value]))
    return litServer.renderToStaticMarkup.call(this, Component, props, safeSlots, metadata)
  },
}
