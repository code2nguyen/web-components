import type { Focus, FocusKey } from '@/lib/focus'

export type View = 'story' | 'patterns' | 'journeys' | 'differences' | 'explore'

/** What every view may do to the shared lens and the detail sheets. */
export interface LensActions {
  /** Merge into the lens, optionally switching view. */
  setLens: (patch: Focus, view?: View) => void
  /** Replace the lens entirely, optionally switching view. */
  replaceLens: (lens: Focus, view?: View) => void
  /** Remove one criterion, or everything without a key. */
  clearLens: (key?: FocusKey) => void
  openPattern: (id: string) => void
  openTrace: (id: string) => void
  goTo: (view: View) => void
}
