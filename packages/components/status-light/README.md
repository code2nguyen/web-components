# Status Light

`c2-status-light` shows the state of something (a deployment, a service, a job) as a coloured dot followed by a short label. It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/status-light'
```

```html
<c2-status-light tone="success">Live</c2-status-light>
<c2-status-light tone="primary" pulse>Building</c2-status-light>
<c2-status-light tone="danger" accessible-label="Failed"></c2-status-light>
```

- `tone`: `neutral` (default), `primary`, `info`, `success`, `warning` or `danger`.
- `pulse`: a soft ring around the dot for a state in progress; stilled under reduced motion.
- `accessible-label`: names a bare dot (the host is then read as an image), or replaces a short visible label.
- Slots: the default slot is the label; `dot` replaces the dot with an icon, coloured with the tone through `currentColor`.
- Size, spacing, shape and a pill background are CSS variables (`--c2-status-light__dot--size`, `--c2-status-light--gap`, `--c2-status-light__dot--clip-path`, `--c2-status-light--background`, …). See the API page for the full list.
