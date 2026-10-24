# App Shell

`c2-app-shell` is the frame of an application: banner, header, navigation, main, an optional details panel (aside) and footer, each in its own landmark, with a skip link to main. It lays out from its own width: below 600px the navigation is a modal drawer, from 600px `tablet-mode` and from 960px `desktop-mode` choose `side`, `rail` or `over`. `c2-app-shell-toggle` opens and closes the navigation (or, with `for="aside"`, the aside) from anywhere inside the shell. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/app-shell'
```

```html
<c2-app-shell close-on-navigate>
  <c2-header slot="header">
    <c2-app-shell-toggle slot="brand"></c2-app-shell-toggle>
    <a slot="brand" href="/">Ledgerline</a>
  </c2-header>
  <c2-list slot="navigation">…</c2-list>
  <c2-page-header><h1>Batches</h1></c2-page-header>
  …
  <section slot="aside" aria-label="Details">…</section>
</c2-app-shell>
```

```js
shell.addEventListener('navigation-opened-change', (event) => event.detail) // { opened, mode }
shell.addEventListener('mode-change', (event) => event.detail) // { breakpoint, mode }
```
