# Task icons

191 duotone icons for to-do items, one Lit web component each: `<c2-task-icon-mail>`, `<c2-task-icon-meeting>`,
`<c2-task-icon-run>`, `<c2-task-icon-cook>`, and more. They cover the subjects a task list is usually about, in
fifteen groups: work, communication, tech, learning, health, sport, home, family, food, shopping, finance, travel,
leisure, nature and planning. `@c2n/todo-list` draws its task icons and its icon picker with them.

The artwork is drawn for this package (MIT, like the rest of the repository) on one 24×24 grid: an outline in
`currentColor` over a soft tint of the same colour, so an icon takes the colour of the text or tile it sits in.

## Installation

```bash
npm install @c2n/task-icons
```

## Usage

Import only the icons you use:

```typescript
import '@c2n/task-icons/icons/mail.js'
```

```html
<c2-task-icon-mail></c2-task-icon-mail>
```

Or register the whole set:

```typescript
import '@c2n/task-icons'
```

An icon is decorative by default (`aria-hidden`). Give it a `label` when no nearby text says the same thing:

```html
<c2-task-icon-cart label="Groceries"></c2-task-icon-cart>
```

## Picking an icon for a task

Every icon carries keywords (`call`: call, phone, ring, dial, contact, mom, dad…). `suggestTaskIcon()` returns the
icon whose keywords best match a piece of text, which is how a to-do list can pick an icon for a list from its title:

```typescript
import { suggestTaskIcon } from '@c2n/task-icons/suggest-task-icon.js'

suggestTaskIcon('Book the dentist') // 'tooth'
suggestTaskIcon('Team standup') // 'meeting'
suggestTaskIcon('Something unrelated') // undefined
```

`taskIconCatalog` (from `@c2n/task-icons/task-icon-names.js`) lists the name, title, category and keywords of every
icon, for your own pickers and search fields; `taskIconTag(name)` gives the element's tag name.

## Styling

| Variable                        | Default        | Description                                        |
| ------------------------------- | -------------- | -------------------------------------------------- |
| `--c2-task-icon--size`          | `24px`         | Width and height of the icon.                      |
| `--c2-task-icon--color`         | `currentColor` | Outline and solid colour.                          |
| `--c2-task-icon--stroke-width`  | `1.75`         | Outline width, in units of the 24×24 canvas.       |
| `--c2-task-icon__tone--color`   | `currentColor` | Colour of the soft duotone fill.                   |
| `--c2-task-icon__tone--opacity` | `0.18`         | Opacity of the soft fill; `0` draws outlines only. |

## Adding an icon

Draw `svg/<name>.svg` on the 24×24 grid (wrapper exactly `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">`),
add its title, category and keywords to `svg/catalog.json`, then run `npm run generate -w packages/icons/task-icons`.
An element without a class is an outline; `class="tone"` adds the soft fill, `fill` is the soft fill alone and
`solid` a small solid mark. The generator rejects hard-coded colours, strokes and styles.
