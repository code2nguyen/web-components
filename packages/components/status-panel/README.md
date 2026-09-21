# `c2-status-panel`

A composable Lit component for empty states, operation outcomes, recoverable errors and unavailable content.

```html
<c2-status-panel status="success" heading="Workspace ready" description="Everything is configured.">
  <c2-button slot="actions">Continue</c2-button>
</c2-status-panel>
```

The `media`, `title`, `description`, `content` and `actions` slots each have a same-named CSS part for their component-owned region. The `media` part also surrounds the built-in status-icon fallback; the title and description parts surround their attribute fallbacks. Content and actions parts remain present but hidden while their slots are empty.

```css
c2-status-panel::part(actions) {
  justify-content: flex-start;
}
```

Style assigned light-DOM content with its own class. A status-panel part does not reach inside the shadow root of an assigned custom element.
