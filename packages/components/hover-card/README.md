# @c2n/hover-card

Preview card shown when a trigger is hovered or focused — a profile behind a mention, the summary behind a link.
The pointer can move into the card and it stays open, so it may hold links and buttons.

```bash
npm install @c2n/components
```

```html
<script type="module">
  import '@c2n/components/hover-card'
</script>

<c2-hover-card>
  <a slot="trigger" href="/users/ada">@ada</a>
  <strong>Ada Lovelace</strong>
  <p>Wrote the first published algorithm for a machine.</p>
</c2-hover-card>
```

| Attribute     | Default  | Description                                                 |
| ------------- | -------- | ----------------------------------------------------------- |
| `placement`   | `bottom` | Preferred side of the trigger; flips when there is no room. |
| `open-delay`  | `700`    | Milliseconds before the card opens.                         |
| `close-delay` | `300`    | Milliseconds before it closes once pointer and focus left.  |
| `open`        | `false`  | Visible state; set it to open or close programmatically.    |
| `disabled`    | `false`  | Hover and focus no longer open the card.                    |

Events: `show`, `hide` (they do not bubble). Styling goes through `--c2-hover-card--*` custom properties; see
`custom-elements.json` or the docs site for the full list.
