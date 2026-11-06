# Device Frame

`c2-device-frame` draws a browser window, phone, tablet or laptop around a screenshot or live content. The screen is a size container named `c2-device-frame`, so content can adapt with container queries.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/device-frame'
```

```html
<c2-device-frame url="app.example.com">
  <img src="dashboard.png" alt="The dashboard, showing this month's revenue" />
</c2-device-frame>

<c2-device-frame device="phone" style="--c2-device-frame__phone--width: 240px">
  <img src="app.png" alt="The mobile app's home screen" />
</c2-device-frame>
```

Attributes: `device` (`browser` | `phone` | `tablet` | `laptop`), `url`. Slots: default (the screen), `address`, `actions`. Each device's width, screen shape and radius, and the bezel, bar and window-dot colours are CSS variables.
