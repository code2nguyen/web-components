# Stat

A compact KPI block with slots for an icon, formatted value, label, trend and supporting description.

```bash
npm install @c2n/stat
```

```html
<script type="module">
  import '@c2n/stat'
</script>

<c2-stat value="$18.4M" label="Assets under management" tone="positive">
  <span slot="trend">+12%</span>
</c2-stat>
```
