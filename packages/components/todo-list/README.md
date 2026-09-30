# @c2n/todo-list

`<c2-todo-list>` is a to-do list with the feel of a paper one. Tasks are plain text, checked off with a hand-drawn
tick (or cross) and a pen stroke through the text; a task you drop gets a red ✗. Progress shows as a ring beside the
heading, a bar, or a large hero ring. Click a task to add a note, drag the grip to reorder, swipe a row left to
archive or delete it and right to check it, or use its ⋯ menu (also a right-click, and the keys E, Delete, X and N).
Archived tasks collect at the bottom and every removal can be undone.

Tasks can carry an optional icon from `@c2n/task-icons`, a highlighter background and a pen colour for their text.
With `customizable`, a palette button opens a panel for the background (whose text colour and pens follow from it),
the pen, the done mark, the density and the progress style; with `storage-key` those choices are remembered in
`localStorage`.

```bash
npm install @c2n/todo-list
```

```html
<c2-todo-list
  heading="Groceries"
  customizable
  storage-key="groceries"
  tasks='[{"label":"Oat milk","note":"2 L barista","icon":"milk"},{"label":"Comté","highlight":"orange"},{"label":"Bread","done":true}]'
></c2-todo-list>
```

```js
import '@c2n/todo-list'

const list = document.querySelector('c2-todo-list')
list.addEventListener('tasks-change', (event) => save(event.detail.tasks))
```

A task is `{ id?, label, note?, done?, dropped?, archived?, icon?, highlight?, ink?, due?, urgent? }`; only `label`
is required. Typing “Oat milk - 2 L barista” in the add field creates a task with a note. Add `persist-tasks` to keep
the tasks in `localStorage` too, and `readonly` for a list that can be read but not changed. `task-toggle`,
`task-add`, `task-remove`, `task-archive`, `task-restore`, `task-change` and `task-reorder` report each change;
`tasks-change` carries the whole new list, and `look-change` the viewer's customization.

Every visual detail is a CSS custom property (`--c2-todo-list__accent--color`, `--c2-todo-list__pen-blue--color`,
`--c2-todo-list__highlight-yellow--color`, …); see the API page of the documentation for the full list. A look the
viewer chooses in the panel wins over them until they press **Reset**.
