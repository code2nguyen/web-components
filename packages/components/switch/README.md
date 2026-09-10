# @c2n/switch

Switch built with Lit: an on/off toggle on a native `<input type="checkbox" role="switch">`, with label, description and optional icons inside the thumb.

```bash
npm install @c2n/switch
```

```html
<script type="module">
  import '@c2n/switch'
</script>

<c2-switch checked>Notifications</c2-switch>
<c2-switch name="digest" value="daily">Email digest<span slot="description">Every morning at 8:00.</span></c2-switch>
<c2-switch checked>
  <svg slot="checked-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
  Two-factor authentication
</c2-switch>
```

- **State**: `checked` reflects the state, `change` fires on every user toggle (click, Space or dragging the thumb past the middle of the track), `toggle(force?)` flips it from code and fires `change`; setting `checked` is silent. `disabled` dims the row and blocks toggling.
- **Label**: the whole row is the label (slotted text or the `label` attribute, plus a `description` slot). `--c2-switch__container--flex-direction: row-reverse` with `justify-content: space-between` gives the settings-row layout with the track at the far edge.
- **Icons**: `checked-icon` and `unchecked-icon` slots show inside the thumb, cross-faded, sized by `--c2-switch__icon--size`.
- **Forms**: the input carries `name` and `value` but sits in a shadow root, so read `checked` on submit or mirror it into a hidden input.
- **Motion**: the thumb slides over `--c2-switch--transition-duration` and stretches slightly while pressed (`--c2-switch__thumb__active--stretch`); both respect reduced motion. Right-to-left layouts slide the other way.

Theme the track (`--c2-switch__track--*`: size, radius, border, off/on/hover colours, focus ring), the thumb (`--c2-switch__thumb--*`) and the text (`--c2-switch__label--*`, `--c2-switch__description--*`). The full list is in `custom-elements.json` and on the docs site.
