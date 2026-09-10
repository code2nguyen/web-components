# Variant and composed components

A variant is one c2 component with a fixed look (CSS variables) and, sometimes, fixed attributes, slots or accessible name. A composed component is several c2 components plus glue. Both set children's CSS variables on the host element or a class — never through `::part()`, which the components do not expose.

## Shape 1: CSS-class variant

```css
.danger-button {
  --c2-button__container--background-color: var(--c2-theme--color-error);
  --c2-button__container__hover--background-color: color-mix(in srgb, var(--c2-theme--color-error), black 12%);
}
```

```html
<c2-button class="danger-button">Delete</c2-button>
```

Use when only the look differs. Keep variant classes in one stylesheet (`ui/variants.css`). Read variable names from the component API; do not invent them.

## Shape 2: wrapper component

When attributes, slots or the accessible name repeat as well. Framework-native, zero runtime cost beyond the c2 element. Example (Astro; the same idea in React/Vue/Svelte):

```astro
---
// SiteIconButton.astro — c2-icon-button with the app's size and a tooltip that defaults to the label.
interface Props {
  label: string
  size?: 'sm' | 'md'
  class?: string
  [attr: string]: unknown
}
const { label, size = 'md', class: className = '', ...rest } = Astro.props
---

<c2-icon-button class={`site-icon-button site-icon-button--${size} ${className}`} aria-label={label} tooltip={label} {...rest}>
  <slot />
</c2-icon-button>
<style is:global>
  .site-icon-button {
    --c2-icon-button--border-radius: var(--c2-theme--radius-sm);
    --c2-icon-button__hover--background-color: var(--c2-theme--color-surface-container);
  }
  .site-icon-button--sm {
    --c2-icon-button__state-layer--size: 30px;
    --c2-icon-button__icon--width: 16px;
    --c2-icon-button__icon--height: 16px;
  }
  .site-icon-button--md {
    --c2-icon-button__state-layer--size: 36px;
    --c2-icon-button__icon--width: 18px;
    --c2-icon-button__icon--height: 18px;
  }
</style>
```

Forward unknown props as attributes (`{...rest}`) so callers keep the full c2 API (`disabled`, `data-*`, `aria-*`).

## Shape 3: Lit subclass

When the variant must be a tag of its own. The docs studio's Code tab and MCP `generate_variant` produce this:

```ts
import { css } from 'lit'
import { Button } from '@c2n/button'

export class DangerButton extends Button {
  static override styles = [
    Button.styles,
    css`
      :host {
        --c2-button__container--background-color: var(--c2-theme--color-error);
      }
    `,
  ]
  override connectedCallback() {
    super.connectedCallback()
    this.setAttribute('running', '') // fixed attributes go here
  }
}
customElements.define('app-danger-button', DangerButton)
```

Import the class from the module that defines the element (`@c2n/tabs/tab.js` for `c2-tab`, `@c2n/feather-icons/icons/<name>.js` for icons). Importing it also registers the original `c2-*` tag, which is fine. Never `customElements.define` a `c2-` name.

## Composed components

Several c2 components and some logic repeat: a search field (`c2-text-field` + `c2-list`), a settings dialog (`c2-modal` + form controls), a toolbar (`c2-icon-button`s + `c2-tooltip`s).

- Set the children's variables on the composed component's class or `:host` (custom properties inherit through shadow boundaries): `.search-palette__field { --c2-text-field--border-top: none; }`.
- Forward the attributes callers should control as properties/attributes of the composed component.
- Re-emit the child events callers need. In Lit use `redispatchEvent(this, event)` from `@c2n/core/dom-helper.js`; elsewhere `dispatchEvent(new CustomEvent(...))`.
- Let the primitives keep their responsibilities (a `c2-modal` already traps focus, closes on Escape and backdrop click, locks scrolling and restores focus): write only the glue.
- Declare composition in JSDoc (`@internalcomponent c2-list`, `@slotcomponent c2-list-item`) when the composed component is itself a Lit element with a manifest.

## Naming and placement

- Own prefix: `app-*`, `site-*`, `my-*`. A custom element name must contain a hyphen.
- One file per variant, one directory (`src/components/ui/`), exported from a barrel.
- Three-line header comment: what it wraps, which variables it fixes, where it is used.
