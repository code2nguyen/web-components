import { defineMessages } from '@c2n/core/localize.js'
import type { TaskIconCategory } from '@c2n/task-icons/task-icon-names.js'

// The list icons' keys, as in `todoListIcons` (repeated here: the component imports this file).
type ListIcon =
  | 'work'
  | 'personal'
  | 'groceries'
  | 'shopping'
  | 'home'
  | 'chores'
  | 'health'
  | 'fitness'
  | 'travel'
  | 'study'
  | 'reading'
  | 'ideas'
  | 'projects'
  | 'finance'
  | 'family'
  | 'events'
  | 'meals'
  | 'errands'
  | 'schedule'
  | 'goals'

/** The name at a 1-based position of a list of default names, or `''` past its end. */
const at = (names: readonly string[]) => (position: number) => names[position - 1] ?? ''

const enListIcons: Record<ListIcon, string> = {
  work: 'Work',
  personal: 'Personal',
  groceries: 'Groceries',
  shopping: 'Shopping',
  home: 'Home',
  chores: 'Chores',
  health: 'Health',
  fitness: 'Fitness',
  travel: 'Travel',
  study: 'Study',
  reading: 'Reading',
  ideas: 'Ideas',
  projects: 'Projects',
  finance: 'Finance',
  family: 'Family',
  events: 'Events',
  meals: 'Meals',
  errands: 'Errands',
  schedule: 'Schedule',
  goals: 'Goals',
}

const enCategories: Record<TaskIconCategory, string> = {
  work: 'Work',
  communication: 'Communication',
  tech: 'Tech',
  learning: 'Learning',
  health: 'Health',
  sport: 'Sport',
  home: 'Home',
  family: 'Family & friends',
  food: 'Food & groceries',
  shopping: 'Shopping',
  finance: 'Money',
  travel: 'Travel',
  leisure: 'Leisure',
  nature: 'Nature',
  planning: 'Planning',
}

const en = {
  // Progress
  noTasksYet: 'No tasks yet',
  allDone: 'All done. Nice work.',
  done: (closed: number, total: number) => `${closed} of ${total} done`,
  urgent: (count: number) => `${count} urgent`,
  tasksDone: (closed: number, total: number) => `${closed} of ${total} tasks done`,
  // Undo message
  undo: 'Undo',
  archivedTask: (label: string) => `Archived “${label}”`,
  deletedTask: (label: string) => `Deleted “${label}”`,
  editedTask: (label: string) => `Edited “${label}”`,
  // Header
  customizeLook: 'Customize look',
  listTitle: 'List title',
  untitledList: 'Untitled list',
  // Filters and empty states
  filters: 'Show',
  filterAll: 'All',
  filterActive: 'To do',
  filterDone: 'Done',
  emptyList: 'No tasks yet. Add your first one below.',
  nothingDone: 'Nothing crossed off yet. You’ve got this.',
  everythingDone: 'Everything’s done. Enjoy the calm.',
  // Tasks
  tasks: 'Tasks',
  tasksOf: (heading: string) => `${heading} tasks`,
  dragToReorder: 'Drag to reorder',
  wontDoTask: (label: string) => `${label}, won’t do`,
  changeIconFor: (label: string) => `Change icon for ${label}`,
  nameOf: (label: string) => `Name of ${label}`,
  noteFor: (label: string) => `Note for ${label}`,
  notePlaceholder: 'Add a note: a quantity, an address, a link…',
  actionsFor: (label: string) => `Actions for ${label}`,
  // Swipe actions
  swipeArchive: 'Archive',
  swipeDelete: 'Delete',
  swipeDone: 'Done',
  // Task menu
  editTask: 'Edit task',
  changeIcon: 'Change icon',
  addIcon: 'Add an icon',
  highlight: 'Highlight',
  textColour: 'Text colour',
  wontDo: 'Won’t do',
  undoWontDo: 'Undo won’t do',
  archive: 'Archive',
  delete: 'Delete',
  deleteKey: 'Del',
  noHighlight: 'No highlight',
  none: 'None',
  defaultTextColour: 'Default text colour',
  default: 'Default',
  penText: (name: string) => `${name} text`,
  // Icon picker
  iconFor: (label: string) => `Icon for ${label}`,
  noIcon: 'No icon',
  searchIcons: 'Search icons',
  searchIconsPlaceholder: (count: number) => `Search ${count} icons`,
  noIconMatches: (query: string) => `No icon matches “${query}”.`,
  iconCategory: (category: TaskIconCategory) => enCategories[category] ?? category,
  // Add field
  newTask: 'New task',
  addPlaceholder: 'Add a task — a note after a dash',
  add: 'Add',
  // Archive
  archivedCount: (count: number) => `Archived · ${count}`,
  restore: 'Restore',
  restoreTask: (label: string) => `Restore ${label}`,
  deleteTask: (label: string) => `Delete ${label}`,
  // Customize panel
  customizeList: 'Customize the list',
  reset: 'Reset',
  panelHint: 'Applies to the whole list. Style one task from its ⋯ menu, or click its icon.',
  icon: 'Icon',
  listIconDialog: 'Icon of the list',
  empty: 'Empty',
  automatic: 'Automatic',
  fromHeading: (name: string) => `${name} · from the heading`,
  listIcon: (name: ListIcon) => enListIcons[name] ?? name,
  background: 'Background',
  backgroundN: (position: number) => `Background ${position}`,
  palette: 'Palette',
  paletteN: (position: number) => `Palette ${position}`,
  fromTheme: 'From the theme',
  doneMark: 'Done mark',
  tick: 'Tick',
  cross: 'Cross',
  density: 'Density',
  cozy: 'Cozy',
  compact: 'Compact',
  progress: 'Progress',
  progressRing: 'Ring',
  progressBar: 'Bar',
  progressHero: 'Hero',
  progressNone: 'None',
  closePanel: 'Close',
  // Colours: the defaults by position, and the name of an unnamed one
  penN: (position: number) => `Pen ${position}`,
  highlighterN: (position: number) => `Highlighter ${position}`,
  defaultPen: at(['Blue ink', 'Red ink', 'Green ink', 'Violet ink', 'Graphite']),
  defaultHighlight: at(['Yellow highlighter', 'Green highlighter', 'Blue highlighter', 'Pink highlighter', 'Orange highlighter', 'Violet highlighter']),
  defaultBackground: at(['Paper', 'Mint', 'Sky', 'Blush', 'Sand', 'Night']),
  defaultPalette: at(['Classic', 'Soft', 'Earth', 'Ocean']),
}

/** The to-do list's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const todoListMessages = defineMessages('todo-list', en)
