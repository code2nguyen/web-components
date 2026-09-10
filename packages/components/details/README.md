# @c2n/details

Collapsible disclosure built on native `<details>` / `<summary>` with Lit.

```bash
npm install @c2n/details
```

```html
<script type="module">
  import '@c2n/details'
</script>

<c2-details label="Shipping">Delivered in 3–5 business days.</c2-details>

<!-- exclusive accordion: opening one closes the others -->
<c2-details name="faq" label="Can I cancel anytime?">Yes.</c2-details>
<c2-details name="faq" label="Do you offer refunds?">Within 14 days.</c2-details>
```

- **Native first**: keyboard access, screen-reader semantics and find-in-page auto-expand come from the browser. `expanded` mirrors the native `open` state and the `toggle` event is re-dispatched on the element.
- **Accordion**: panels that share a `name` (within the same document or shadow root) are exclusive: opening one closes the others.
- **Slots**: `title` (or the `label` attribute), `header-content` for a second header row that stays visible when collapsed and whose buttons and links do not toggle the panel, `icon` and `expanded-icon` for the chevron, and the default slot for the content.
- **Options**: `title-not-clickable` makes only the icon toggle; `disabled` dims the header and blocks toggling.
- **Animation**: open and close slide the content (height plus a fade) with the Web Animations API, so the motion is the same in every browser; `--c2-details--transition-duration: 0ms` turns it off, and `prefers-reduced-motion` is respected.

Theming is done through CSS custom properties: `--c2-details--*` for the frame, `--c2-details__header--*` (plus `__icon`, `__content`, `__hover`, `__open`, `__focus`, `__disabled`) for the summary, and `--c2-details__content--*` for the body. The full list is in `custom-elements.json` and on the docs site.
