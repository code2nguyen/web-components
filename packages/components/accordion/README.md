# Accordion

`c2-accordion` combines directly slotted `c2-details` panels into a connected, animated disclosure surface. It owns their shared borders, dividers and outside corners, and coordinates expansion through Lit context. Opening one closes its siblings; add `multiple` to allow independent expansion. All panels may be closed.

```sh
npm install @c2n/accordion
```

```js
import '@c2n/accordion'
```

The import also registers `c2-details`.

```html
<c2-accordion>
  <c2-details label="Shipping" expanded>Delivered in 3–5 business days.</c2-details>
  <c2-details label="Returns">Return within 30 days.</c2-details>
  <c2-details label="Unavailable" disabled>Coming soon.</c2-details>
</c2-accordion>

<c2-accordion multiple>
  <c2-details label="Sizing" expanded>Choose your usual size.</c2-details>
  <c2-details label="Care" expanded>Wash cold.</c2-details>
</c2-accordion>
```

## API

- `multiple`: reflected Boolean property/attribute, default `false`.
- Default slot: direct `c2-details` children. Wrapped descendants are not coordinated; nested accordions remain independent.
- `--c2-accordion--gap`: panel spacing, default `0px`. Zero joins the panels with single dividers and only outside corners rounded. A positive gap restores individual rounded cards.
- `--c2-accordion--border-width`: outer borders and dividers, default `1px`.
- `--c2-accordion--border-color`: outer borders and dividers, default `#d5d5d5`.
- `--c2-accordion--border-radius`: outside corners, default `8px`.
- `--c2-accordion--transition-duration`: expansion and chevron timing, default `300ms`; use `0ms` for instant toggling. Reduced-motion preferences disable transitions.

The accordion controls panel frames and animation timing. Use inherited `--c2-details-*` properties for header/content colors, padding and typography. Panel height is animated by `c2-details` itself (slide plus fade), so it behaves the same in every browser.

Control individual panels with `expanded` or `toggle(force?)`. Listen for `toggle` directly on each panel; it does not bubble. There is no aggregate accordion event. Disabled panels block user toggling but may still be closed when a sibling opens.

When multiple panels start expanded, or `multiple` is removed, the first expanded panel in DOM order stays open. Child insertion and reconnection use the same rule. Subsequent openings take precedence. Grouping belongs to the container and does not require panel `name` values.

Panels retain native Tab, Enter/Space, focus, and disclosure semantics, their title/header/icon slots, and reduced-motion support.

```html
<c2-accordion>
  <c2-details label="Products" expanded>
    <c2-accordion>
      <c2-details label="Clothing">Shirts and jackets.</c2-details>
      <c2-details label="Accessories">Bags and hats.</c2-details>
    </c2-accordion>
  </c2-details>
  <c2-details label="Support">Contact our team.</c2-details>
</c2-accordion>
```
