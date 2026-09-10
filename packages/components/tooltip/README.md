# @c2n/tooltip

Contextual hint shown when its target is hovered or focused, built with Lit on the Popover API and floating-ui.

```bash
npm install @c2n/tooltip
```

```html
<script type="module">
  import '@c2n/tooltip'
</script>

<button>Save<c2-tooltip>Save changes (⌘S)</c2-tooltip></button>

<span id="term">HTTP</span>
<c2-tooltip for="term" placement="bottom">Hypertext Transfer Protocol</c2-tooltip>
```

- **Target**: the parent element by default, the element named by `for="<id>"`, or the previous sibling with `target-strategy="previousElement"`. The `target` property can be assigned directly.
- **Text**: the slotted content, or the target's `data-tooltip` attribute when the slot is empty.
- **Behaviour**: shows after `delay` ms on hover or focus, hides on leave, blur, press or Escape (`hide-delay` keeps it a moment longer). `open` shows or hides it programmatically; `show` and `hide` events fire.
- **Placement**: `placement` (any floating-ui placement, default `top`) flips and shifts to stay on screen; the side in use is reflected as `current-placement`. `position="top,bottom"` is still accepted as a list of allowed sides.
- **Rendering**: a `popover="manual"` element in the top layer, so it is never clipped and the target is not modified. `role="tooltip"` plus `aria-describedby` on the target for assistive technology.

Theming: `--c2-tooltip--*` (colours, radius, shadow, border, font, padding, max-width, offset, animation) and `--c2-tooltip__arrow--size`; `hide-arrow` removes the arrow.
