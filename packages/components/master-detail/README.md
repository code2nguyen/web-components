# Master Detail

`c2-master-detail` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/master-detail'
```

```html
<c2-master-detail style="height: 480px">
  <c2-list slot="master" required aria-label="Inbox">…</c2-list>
  <article slot="detail">…</article>
  <c2-status-panel slot="placeholder" heading="Select a conversation"></c2-status-panel>
</c2-master-detail>
```

A list beside the record it opens. The layout follows the element's own width: from `breakpoint` (720px) the panes sit side by side, with the `placeholder` slot shown while nothing is open; below it `collapse="stack"` (default) shows one pane at a time with a Back bar, and `collapse="overlay"` slides the detail over the list. The app fills the `detail` slot and sets `open`; Back, Escape (overlay) and the backdrop fire a cancelable `close-request` before clearing it. The current layout is the read-only `layout` property, the `layout-change` event and the `:state(split | stack | overlay)` custom states. See the docs page for every slot, event and `--c2-master-detail__*` variable.
