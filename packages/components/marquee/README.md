# Marquee

`c2-marquee` scrolls its children in a continuous loop: logo walls, testimonials, ticker tapes. Each child element is one item and keeps its own DOM. It pauses on hover, on focus inside and while `paused` is set. Keyboard focus and a request for reduced motion both stop it and lay the items out as a row the reader scrolls by hand, with the focused item in view.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/marquee'
```

```html
<c2-marquee aria-label="Customers" style="--c2-marquee--speed: 30; --c2-marquee__viewport--fade: 48px">
  <img src="northwind.svg" alt="Northwind" />
  <img src="contoso.svg" alt="Contoso" />
  <img src="fabrikam.svg" alt="Fabrikam" />
</c2-marquee>
```

Attributes: `orientation` (`horizontal` | `vertical`), `reverse`, `paused`. Styling: `--c2-marquee--speed` (pixels per second), `--c2-marquee__item--gap`, `--c2-marquee__item--align`, `--c2-marquee__viewport--fade`, `--c2-marquee__viewport--height` (vertical strips), `--c2-marquee__viewport__focus--outline` (the ring shown when, under reduced motion, the strip takes keyboard focus to scroll).
