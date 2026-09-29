# Timeline

A vertical sequence of dated events on a connected rail — order history, activity feeds, changelogs, milestones.

```bash
npm install @c2n/timeline
```

```html
<script type="module">
  import '@c2n/timeline'
</script>

<c2-timeline aria-label="Order history">
  <c2-timeline-item label="Order placed" timestamp="Sep 12, 09:14" datetime="2026-09-12T09:14" tone="success">Paid with a card ending 4242.</c2-timeline-item>
  <c2-timeline-item label="Shipped" timestamp="Sep 13, 16:02" tone="primary">Handed to the carrier.</c2-timeline-item>
  <c2-timeline-item label="Out for delivery" timestamp="Expected Sep 15"></c2-timeline-item>
</c2-timeline>
```

`layout="split"` moves the timestamps into a column before the rail. Each entry has `label`, `timestamp` and `marker`
slots, and its content goes in the default slot. Style it through the `--c2-timeline-item__*` CSS custom properties.
