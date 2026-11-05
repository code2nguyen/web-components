import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** The accessible name of the browser when it has no `label`. */
  files: 'Files',
  /** The root folder's name when `root-label` is empty. */
  root: 'My files',
  /** The folder pane's accessible name. */
  folders: 'Folders',
  /** The breadcrumb trail's accessible name. */
  path: 'Folder path',
  /** The search field's placeholder: `{0}` is the open folder. */
  searchIn: (folder: string) => `Search in ${folder}`,
  /** The list or grid's accessible name: `{0}` is the open folder. */
  contents: (folder: string) => `Contents of ${folder}`,
  /** The button that opens the parent folder in the narrow layout. */
  up: 'Parent folder',
  /** The view switch and its two buttons. */
  view: 'View',
  listView: 'List view',
  gridView: 'Grid view',
  /** The sort menu, its trigger (`{0}` the column, `{1}` the direction) and its rows. */
  sort: 'Sort',
  sortedBy: (column: string, direction: string) => `Sort: ${column}, ${direction}`,
  ascending: 'Ascending',
  descending: 'Descending',
  /** Column headers. */
  name: 'Name',
  modified: 'Modified',
  size: 'Size',
  kind: 'Kind',
  /** A column header's sort button: `{0}` the column, `{1}` its current direction or an empty string. */
  sortBy: (column: string, direction: string) => (direction ? `${column}, sorted ${direction.toLowerCase()}` : `Sort by ${column}`),
  /** An item's accessible name: name, kind, size (may be empty), and modification date (may be empty). */
  itemName: (name: string, kind: string, size: string, modified: string) =>
    [name, kind, size, modified ? `modified ${modified}` : ''].filter(Boolean).join(', '),
  /** The row and tile menu. */
  actions: 'Actions',
  more: (name: string) => `More actions for ${name}`,
  /** The selection bar: `{0}` is the count, `{1}` the total size or an empty string. */
  selected: (count: number, size: string) => (size ? `${count} selected · ${size}` : `${count} selected`),
  clearSelection: 'Clear selection',
  /** The rename field's accessible name: `{0}` is the current name. */
  rename: (name: string) => `Rename ${name}`,
  /** Empty states. */
  empty: 'This folder is empty',
  emptyHint: 'Drop files here to add them.',
  noResults: (query: string) => `No results for “${query}”`,
  noResultsHint: 'Try another name.',
  loading: 'Loading…',
  /** Announcements. */
  opened: (folder: string, count: number) => `${folder}, ${count === 1 ? '1 item' : `${count} items`}`,
  moving: (count: number, folder: string) => `Moving ${count === 1 ? '1 item' : `${count} items`} to ${folder}`,
  dropping: (count: number, folder: string) => `Adding ${count === 1 ? '1 file' : `${count} files`} to ${folder}`,
  /** Kinds. `{0}` is the format, such as PNG or ZIP. */
  kindFolder: 'Folder',
  kindPdf: 'PDF',
  kindImage: (format: string) => (format ? `${format} image` : 'Image'),
  kindVideo: (format: string) => (format ? `${format} video` : 'Video'),
  kindAudio: (format: string) => (format ? `${format} audio` : 'Audio'),
  kindArchive: (format: string) => (format ? `${format} archive` : 'Archive'),
  kindDocument: 'Document',
  kindSpreadsheet: 'Spreadsheet',
  kindPresentation: 'Presentation',
  kindText: 'Text',
  kindCode: (format: string) => format || 'Code',
  kindFile: (format: string) => (format ? `${format} file` : 'File'),
}

/** The file browser's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const fileBrowserMessages = defineMessages('file-browser', en)
