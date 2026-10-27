# Notification Center

`c2-notification-center` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/notification-center'
```

```html
<c2-notification-center notifications='[{"id":"1","title":"Ana mentioned you","time":"2026-10-27T09:40:00Z"}]'></c2-notification-center>
```

An inbox panel of notifications, like GitHub's or Linear's: grouped by day, unread ones marked, with an All / Unread
filter and "Mark all as read". Put it in a `c2-overlay`, a `c2-sheet` or a page column.

- `notifications`: `{ id, title, body, time, read, href, avatar, group }[]`.
- `notification-click` and `read-change` are cancelable, then the panel updates `notifications`.
- `group-by` (`day`, `field`, `none`), `filter`, `has-more` + `load-more`, and the `empty` and `header-actions` slots.
- Themed through `--c2-notification-center*` custom properties; see the API page of the docs site.
