# Reaction Bar

`c2-reaction-bar` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/reaction-bar'
```

```html
<c2-reaction-bar reactions='[{"emoji":"👍","count":4,"reacted":true},{"emoji":"🎉","count":2}]'>
  <c2-emoji-picker slot="picker"></c2-emoji-picker>
</c2-reaction-bar>
```

The emoji reactions under a message, comment or post, like those of Slack and GitHub: one pill per emoji with its count,
pressed when the current user reacted. Pressing a pill toggles their reaction; the button at the end opens quick reactions
and, in the `picker` slot, a `c2-emoji-picker`.

- `reactions`: an array (or JSON attribute) of `{ emoji, count, reacted }`.
- `quick`: the reactions offered first in the popup, as emoji separated by spaces.
- `readonly`: shows the reactions without toggling or the add button.
- Every change fires a cancelable `reaction-change` (`emoji`, `reacted`, `count`), then updates `reactions`; cancel it
  to keep the bar controlled.
- Themed through `--c2-reaction-bar*` custom properties; see the API page of the docs site.
