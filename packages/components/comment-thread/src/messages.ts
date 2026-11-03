import { defineMessages } from '@c2n/core/localize.js'

const en = {
  /** Accessible name of the thread when it has no `label`. */
  label: 'Comment thread',
  /** A comment, as a screen reader names it: the author, then when. */
  commentBy: (name: string, time: string) => `${name}, ${time}`,
  /** Shown after a comment's time once it was edited. */
  edited: 'edited',
  resolve: 'Resolve',
  reopen: 'Reopen',
  /** The line of a resolved thread. */
  resolvedLine: (replies: number) => (replies === 0 ? 'Resolved' : replies === 1 ? 'Resolved · 1 reply' : `Resolved · ${replies} replies`),
  /** The button that unfolds the middle of a long thread. */
  showEarlier: (count: number) => (count === 1 ? 'Show 1 earlier reply' : `Show ${count} earlier replies`),
  edit: 'Edit',
  /** The edit and delete buttons' accessible names. */
  editLabel: (name: string) => `Edit ${name}'s comment`,
  delete: 'Delete',
  deleteLabel: (name: string) => `Delete ${name}'s comment`,
  /** The question of the delete confirmation, for a reply and for the first comment. */
  deleteQuestion: 'Delete this comment?',
  deleteThreadQuestion: 'Delete this thread?',
  save: 'Save',
  cancel: 'Cancel',
  reply: 'Reply',
  /** The composer's placeholder and accessible name, and the editor's. */
  replyPlaceholder: 'Reply…',
  editPlaceholder: 'Edit comment',
  /** The quoted text the thread is about, as a screen reader hears it. */
  quoteLabel: 'Commenting on',
  /** Announced in a live region. */
  replyAdded: 'Reply added',
  commentEdited: 'Comment edited',
  commentDeleted: 'Comment deleted',
  threadResolved: 'Thread resolved',
  threadReopened: 'Thread reopened',
}

/** The comment thread's interface text in English. An app adds its languages with `addTranslations`; each shows for the nearest `lang`. */
export const commentThreadMessages = defineMessages('comment-thread', en)
