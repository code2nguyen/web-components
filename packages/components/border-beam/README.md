# Border Beam

Decorative, pointer-transparent gradient that travels inside a masked border channel. It supports multiple evenly
distributed beams plus configurable size, line width, outset, duration and direction.

```bash
npm install @c2n/border-beam
```

```html
<div class="card">
  Card content
  <c2-border-beam side="top"></c2-border-beam>
</div>

<style>
  .card {
    position: relative;
    overflow: hidden;
    border-radius: 12px;
  }

  c2-border-beam {
    --c2-border-beam__beam--size: 80px;
    --c2-border-beam__beam--duration: 6s;
  }
</style>
```
