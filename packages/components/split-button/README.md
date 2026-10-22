# Split Button

`c2-split-button` is a main action with a caret that opens a menu of alternatives ("Send ▾"). It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/split-button'
```

```html
<c2-split-button>
  Send
  <c2-menu-item slot="menu" value="schedule">Schedule send</c2-menu-item>
  <c2-menu-item slot="menu" value="archive">Send and archive</c2-menu-item>
</c2-split-button>

<c2-split-button mode="choice" value="squash" caret-label="Choose merge method">
  <c2-menu-item slot="menu" value="merge">Create a merge commit</c2-menu-item>
  <c2-menu-item slot="menu" value="squash">Squash and merge</c2-menu-item>
</c2-split-button>
```

```js
splitButton.addEventListener('action', (event) => send(event.detail.value)) // the main half
splitButton.addEventListener('menu-select', (event) => run(event.detail.value)) // fixed mode: a row was picked
splitButton.addEventListener('change', () => savePreference(splitButton.value)) // choice mode
```

The two halves are two native buttons (two tab stops); the caret follows the menu button pattern and the menu is a `c2-menu` anchored to the whole control. `mode="choice"` turns the rows into radios whose checked row names the main half. `disabled`, `main-disabled`, `running`, `toggle` + `selected`, `type="submit"` with `name`/`value`, and `placement` cover the states. Every look is a set of `--c2-split-button__*` custom properties; the docs site lists them on the API tab.
