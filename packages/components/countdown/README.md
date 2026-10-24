# Countdown

`c2-countdown` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/countdown'
```

```html
<!-- Count down to a moment, a box per unit -->
<c2-countdown date="2030-01-01T00:00:00Z"></c2-countdown>

<!-- A one-minute timer drawn as a clock -->
Resend code in <c2-countdown display="clock" units="minutes seconds" duration="60"></c2-countdown>

<!-- A phrase, leading zero units left out, with content for the end -->
<c2-countdown display="inline" trim date="2030-01-01T00:00:00Z">
  <strong slot="ended">We are live!</strong>
</c2-countdown>
```

- `date` (ISO 8601 string, millisecond timestamp or `Date`) or `duration` (seconds; starts on connect unless `paused`).
- `display`: `segments` (default), `clock` or `inline`; `units`: any of `days hours minutes seconds`; `format`: `long`, `short`, `narrow`; `trim`.
- `warn-at` seconds; `paused`; `locale` (else the nearest `lang`).
- Methods `start()`, `pause()`, `reset()`; getter `remaining` (ms).
- Events `tick` (`detail.remaining`) and `complete`; slot `ended`.
- States `:state(running)`, `:state(paused)`, `:state(warning)`, `:state(ended)`; parts `segment`, `value`, `label`, `separator`, `text`.

See the [docs page](https://code2nguyen.github.io/web-components/components/countdown) for every CSS custom property.
