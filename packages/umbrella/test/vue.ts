// One import registers every c2-* tag with Volar, and carries the packages' Vue composables.
import { useRenderedRows } from '@c2n/components/vue'
import { useRenderedRows as tableComposable } from '@c2n/table/vue'
import type { GlobalComponents } from 'vue'

export const composable: typeof tableComposable = useRenderedRows

type Tag = keyof GlobalComponents
export const tags: Tag[] = ['c2-button', 'c2-table', 'c2-line-chart', 'c2-chat-message']
// @ts-expect-error: a tag no package defines is not declared
export const unknown: Tag = 'c2-not-a-component'
