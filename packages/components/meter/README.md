# Meter

`@c2n/components/meter` provides `c2-meter`, a measurement inside a known range (storage used, a plan's quota, a password's strength) with the native `<meter>` thresholds and an optional segmented breakdown.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/meter'
</script>

<c2-meter value="62000" max="100000" value-text="62,000 of 100,000 calls">API calls this month</c2-meter>

<c2-meter value="96" low="70" high="90" optimum="0">Disk usage</c2-meter>

<c2-meter max="15" segments='[{"label":"Photos","value":6},{"label":"Documents","value":3},{"label":"Mail","value":1.5}]'>Storage</c2-meter>
```

`low`, `high` and `optimum` judge the value as optimum, sub-optimum or critical, like the native `<meter>`; the bar takes the matching `--c2-meter__indicator…--background-color` and the host matches `:state(optimum)`, `:state(suboptimum)` or `:state(critical)`. `value-text` replaces the shown percentage and is what a screen reader announces. Built-in text is English and translatable through `addTranslations({ fr: { meter: { … } } })`.

A segmented meter with `overage` may pass `max`, as seats assigned past a licence's limit do: the part past `max` is drawn as an overage segment after a limit mark, listed in the legend as "Over limit" and announced.

```html
<c2-meter max="50" overage segments='[{"label":"Assigned","value":48},{"label":"Pending","value":8}]'>Seats</c2-meter>
```

## Range indicator

`@c2n/components/meter/range-indicator` provides `c2-range-indicator`, one value placed on a banded scale (a lab result against its reference ranges, a salary inside its pay band). Its entry is separate, so importing it does not load `c2-meter`.

```html
<script type="module">
  import '@c2n/components/meter/range-indicator'
</script>

<c2-range-indicator
  min="40"
  max="160"
  value="88"
  value-text="88 mg/dL"
  bands='[{"label":"Low","to":70,"tone":"suboptimum"},{"label":"Normal","to":100,"tone":"optimum"},{"label":"High","tone":"critical"}]'
  >Fasting glucose</c2-range-indicator
>
```
