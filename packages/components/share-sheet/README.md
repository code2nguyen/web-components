# Share Sheet

`c2-share-sheet` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/share-sheet'
```

```html
<c2-button onclick="document.querySelector('c2-share-sheet').share()">Share</c2-button>
<c2-share-sheet heading="Trip to Lisbon" url="https://example.com/trips/lisbon" qr></c2-share-sheet>
```

Share a link anywhere: the link with a copy button, targets (email, text message, X, LinkedIn, Facebook, WhatsApp,
Telegram, Reddit), the device's own share sheet where there is one, and an optional QR code, in a `c2-sheet`.

- `share()` opens the device's share sheet when there is one, this sheet otherwise; `show()` / `close()` / `open`.
- Every target fires a cancelable `share` with `{ target, url }`; only http(s) links are offered to targets, which open
  in a new tab without a referrer.
- No trademarked logos: neutral tiles, with `icon-<target>` slots for licensed artwork.
- Themed through `--c2-share-sheet*` custom properties; see the API page of the docs site.
