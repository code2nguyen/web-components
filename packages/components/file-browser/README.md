# File browser

`c2-file-browser` shows folders and files, as Google Drive, Dropbox or a CMS media library do: a folder tree, breadcrumbs, search, sorting, a list and a grid view, selection, a context menu, renaming and drag and drop. It is the interface over your storage and never reads or writes a file: every change the user asks for is an event, and your app updates `items`.

It ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/file-browser'
```

```html
<c2-file-browser
  folder="q4"
  actions='[{"id":"download","label":"Download","multiple":true},{"id":"rename","label":"Rename"},{"id":"delete","label":"Delete","multiple":true}]'
  items='[{"id":"q4","name":"Q4 planning","kind":"folder"},{"id":"roadmap","name":"Q4 roadmap.pdf","parent":"q4","kind":"file","size":2400000,"modified":"2026-11-02"}]'
></c2-file-browser>
```

```js
const browser = document.querySelector('c2-file-browser')
browser.addEventListener('item-move', ({ detail }) => api.move(detail.items, detail.target))
browser.addEventListener('item-rename', ({ detail }) => api.rename(detail.item.id, detail.name))
browser.addEventListener('files-drop', ({ detail }) => api.upload(detail.files, detail.folder))
// Large trees: load a folder the first time it opens.
browser.loadChildren = (folder) => api.list(folder)
```

- **Data:** `items` is a flat list of `{ id, name, parent, kind, size?, modified?, type?, thumbnail? }`; `folder` is the open folder and `root-label` names the root. `loadChildren(folder)` loads a folder on first open, cached until `refresh()`.
- **Views:** `view` is `list` or `grid`; `sort` and `sort-direction` order the items, folders first; search filters the open folder (`search="remote"` fires `search` instead).
- **Selection:** `selection` is `multiple` (the default) or `single`; `value` holds the selected ids (`selection-change`, which does not bubble).
- **Events:** `folder-change`, `item-open`, `item-action`, `item-rename`, `item-move`, `files-drop`, `search`, `view-change`, `sort-change`, `load-error`.
- **Actions:** `actions` fills the context menu and the selection bar; `rename` edits in place (F2) and `delete` is bound to the Delete key.
- **Theming:** `--c2-file-browser--*` variables for the height, borders, pane width, rows, tiles, accent, selection bar and the type-icon colours.

Below `--c2-file-browser--narrow-width` the folder pane hides, an Up button appears and rows show their size and date under the name. Every item is reachable from the keyboard and named by its name, kind, size and date.
