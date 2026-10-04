# @c2n/gantt

A read-only Gantt chart web component: tasks, groups, milestones and finish-to-start dependencies on a day, week or
month scale, themed through CSS custom properties.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/gantt'
</script>

<c2-gantt aria-label="Docs relaunch">
  <c2-gantt-task task-id="design" label="Design">
    <c2-gantt-task task-id="ia" start="2026-09-28" end="2026-10-02" progress="0.8">Information architecture</c2-gantt-task>
    <c2-gantt-task task-id="vis" start="2026-10-05" end="2026-10-16" dependencies="ia">Visual design</c2-gantt-task>
  </c2-gantt-task>
  <c2-gantt-task start="2026-10-16" milestone dependencies="vis">Design review</c2-gantt-task>
</c2-gantt>
```

Or give it data: `gantt.tasks = [{ id, label, start, end, progress, parent, dependencies, milestone, tone }]`. An
array in `tasks` wins over `c2-gantt-task` children. Dates are `YYYY-MM-DD` calendar days and `end` is inclusive.
Weeks start on the locale's first day unless `week-start` says otherwise.
