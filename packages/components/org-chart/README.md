# Org Chart

`@c2n/components/org-chart` provides `c2-org-chart`, a hierarchy drawn as connected cards: an organization chart, a reporting line or a team structure. A manager's card carries a toggle that collapses or expands the people below it.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/org-chart'

  document.querySelector('c2-org-chart').items = [
    { id: 'ana', label: 'Ana Ruiz', description: 'CEO', children: [{ id: 'li', label: 'Li Wei', description: 'CTO' }] },
  ]
</script>

<c2-org-chart aria-label="Leadership team" selectable></c2-org-chart>
```

`collapsed-items` lists the nodes whose reports start hidden, `orientation="horizontal"` draws reports beside their manager, and `renderItem` replaces the content of every card. `item-click`, `selection-change` and `expansion-change` report what the user does. The chart is an ARIA tree with one Tab stop; the arrow keys follow the drawing. Its look is set through the `--c2-org-chart*` custom properties.
