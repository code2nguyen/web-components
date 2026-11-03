# In View

`c2-in-view` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/in-view'
```

```html
<c2-in-view once style="--c2-in-view__hidden--opacity: 0; --c2-in-view__hidden--transform: translateY(24px)">…</c2-in-view>
```

Reacts when its content scrolls into view: reveal it, load more, or pause it when it leaves.

- `enter` / `leave` events with the visible ratio; `threshold`, `root-margin`, `once`, `disabled`.
- The state is a CSS custom state: `c2-in-view:state(in-view)`; nothing is written on the host.
- A built-in reveal driven by CSS variables, off under `prefers-reduced-motion`.
- Themed through `--c2-in-view*` custom properties; see the API page of the docs site.
