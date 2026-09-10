# @c2n/modal

Modal dialog built on the native `<dialog>` element, with Lit.

```bash
npm install @c2n/modal
```

```html
<script type="module">
  import '@c2n/modal'
</script>

<button onclick="invite.show()">Invite</button>

<c2-modal id="invite">
  <h2 slot="title">Invite your team</h2>
  <p>Share the link with your teammates.</p>
  <c2-button slot="footer" onclick="invite.close('cancel')">Cancel</c2-button>
  <c2-button slot="footer" onclick="invite.close('ok')">Copy link</c2-button>
</c2-modal>
```

- **Native first**: `showModal()` traps and restores focus, makes the page inert and draws a backdrop; Escape closes through the cancelable `cancel` event.
- **Open / close**: the `open` attribute or `show()`; `close(returnValue)`, the × button, a backdrop click or Escape. `no-backdrop-close`, `no-escape` and `hide-close` turn each of those off. `close` fires with `detail.returnValue`, `open` after showing.
- **Layout**: `title` slot (labels the dialog; use `label` when there is none), body in the default slot (scrolls past `--c2-modal--max-height`), `footer` slot as an actions row. The page does not scroll while a modal is open (`no-scroll-lock` opts out).
- **Looks**: everything is a token: size and margins (`--c2-modal--margin-top: 24px` pins it to the top, `margin-bottom: 0` + full width makes a bottom sheet), radius, shadow, the header/body/footer paddings and dividers, the close button, the backdrop colour and blur, and the enter animation (`--c2-modal--enter-transform`).

The full token list is in `custom-elements.json` and on the docs site.
