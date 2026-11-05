# @c2n/scheduler

`c2-scheduler`: a resource timeline. People, rooms or machines run down the side, time across the top, and each
booking is a bar on its resource's row, in a day, week or month view. With `editable`, users drag to create, move and
resize bookings, and the scheduler reports each request (`range-select`, `event-change`) for the app to apply.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/scheduler'
</script>

<c2-scheduler
  date="2026-11-09"
  editable
  resources='[{"id":"ana","label":"Ana Ruiz","group":"Design"}]'
  events='[{"id":"e1","resource":"ana","start":"2026-11-09T09:00","end":"2026-11-09T10:30","title":"Kick-off"}]'
></c2-scheduler>
```

Documentation: https://code2nguyen.github.io/web-components/components/scheduler
