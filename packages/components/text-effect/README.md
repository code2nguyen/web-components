# Text Effect

`c2-text-effect` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/text-effect'
```

```html
<h1>Build <c2-text-effect effect="rotate" words="faster;safer;together"></c2-text-effect></h1>
<p><c2-text-effect effect="shimmer">Thinking…</c2-text-effect></p>
```

Animated text: words that rotate, a typewriter, characters that unscramble, a shimmer, or words that rise into place.

- `effect` is `rotate`, `typewriter`, `scramble`, `shimmer` or `reveal`; `words` gives `rotate` and `typewriter` their list.
- `play` starts it on load, in view or on hover; `loop` repeats a one-shot effect; `replay()` starts it again.
- Assistive technology reads the still text; reduced motion shows the final state.
- Timings and the gradient fill are `--c2-text-effect*` custom properties; see the API page of the docs site.
