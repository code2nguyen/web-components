import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the map when `label` is not set. */
  label: 'Mind map',
  roleDescription: 'mind map',
  topicRoleDescription: 'topic',
  /** The host's description while `editable`. */
  keyHelp: 'Tab adds a subtopic, Enter a sibling, F2 edits, Delete removes. Escape, then Tab, leaves the map.',
  /** The host's description while read-only. */
  keyHelpReadOnly: 'Arrow keys follow the drawing, Space folds, Home goes to the central topic.',
  /** Name of the canvas, which holds focus after Escape so Tab leaves the map. */
  canvas: 'Mind map canvas',
  /** Accessible name of the inline editor. */
  editTopic: 'Edit topic',
  /** Label of a new topic. */
  newTopic: 'New topic',
  /** Tooltip of the round "+" on the selected topic. */
  addSubtopic: 'Add subtopic',
  /** Tooltip of the fold dot of an expanded topic. */
  fold: 'Fold',
  /** Tooltip of the fold dot of a folded topic, which shows the count. */
  unfold: (count: number) => (count === 1 ? 'Unfold 1 hidden topic' : `Unfold ${count} hidden topics`),
  ctrlKey: 'Ctrl',
  added: (parent: string) => `Added a subtopic of ${parent}`,
  addedSibling: (sibling: string) => `Added a topic next to ${sibling}`,
  edited: (label: string) => `Renamed to ${label}`,
  deleted: (label: string, count: number, mod: string) =>
    count === 0
      ? `Deleted ${label}. ${mod}+Z to undo`
      : count === 1
        ? `Deleted ${label} and 1 subtopic. ${mod}+Z to undo`
        : `Deleted ${label} and ${count} subtopics. ${mod}+Z to undo`,
  movedInto: (label: string, parent: string) => `Moved ${label} into ${parent}`,
  movedTo: (label: string, position: number, total: number) => `Moved ${label} to position ${position} of ${total}`,
  folded: (count: number) => (count === 1 ? 'Folded, 1 topic hidden' : `Folded, ${count} topics hidden`),
  unfolded: (count: number) => (count === 1 ? 'Unfolded, 1 topic shown' : `Unfolded, ${count} topics shown`),
  recoloured: (label: string) => `Changed the colour of ${label}`,
  copied: (count: number) => (count === 1 ? 'Copied 1 topic' : `Copied ${count} topics`),
  pasted: (count: number, parent: string) => (count === 1 ? `Pasted 1 topic into ${parent}` : `Pasted ${count} topics into ${parent}`),
  undone: 'Undone',
  redone: 'Redone',
  nothingToUndo: 'Nothing to undo',
  nothingToRedo: 'Nothing to redo',
  cancelled: 'Move cancelled',
}

/** The mind map's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const mindMapMessages = defineMessages('mind-map', en)
