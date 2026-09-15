# Date Selector

Accessible one- or two-month date-range picker for Lit applications and plain HTML.

```bash
npm install @c2n/date-selector
```

```html
<script type="module" src="@c2n/date-selector"></script>

<c2-date-selector from="2026-09-10" to="2026-09-15" min="2026-09-01" name="trip"></c2-date-selector>
```

Dates use local-calendar ISO strings (`YYYY-MM-DD`). The first selection starts a range, the second completes it, and
the next starts over. The component supports arrow-key navigation, month paging, locale and week-start options,
min/max constraints, disabled and required states, and form submission.
