# @c2n/todo-list

`<c2-todo-list>` is a to-do list made to be looked at: a progress ring beside the heading (or a bar, or a large hero
ring), a coloured icon tile for every task, filters, and an add field that picks a fitting icon from what you type.
With `customizable`, a palette button opens a panel where the viewer changes the background, the accent, the
progress style, the density and each task's icon and colour; with `storage-key`, those choices are remembered in
`localStorage`. Task icons come from `@c2n/task-icons`.

```bash
npm install @c2n/todo-list
```

```html
<c2-todo-list
  heading="Launch week"
  customizable
  storage-key="launch-week"
  tasks='[{"label":"Draft the announcement","done":true},{"label":"Ship the v2.0 build","icon":"rocket","due":"Today","urgent":true}]'
></c2-todo-list>
```

```js
import '@c2n/todo-list'

const list = document.querySelector('c2-todo-list')
list.addEventListener('tasks-change', (event) => save(event.detail.tasks))
```

A task is `{ id?, label, done?, icon?, color?, due?, urgent? }`. A missing `icon` is suggested from the label, a
missing `color` assigned in turn. Add `persist-tasks` to keep the tasks in `localStorage` too, and `readonly` for a
list that can be read but not changed. `task-toggle`, `task-add`, `task-remove` and `task-change` report each change;
`tasks-change` carries the whole new list, and `look-change` the viewer's customization.

Every visual detail is a CSS custom property (`--c2-todo-list__accent--color`, `--c2-todo-list__ring--size`,
`--c2-todo-list__tile--size`, …); see the API page of the documentation for the full list. A look the viewer chooses
in the panel wins over them until they press **Reset**.
