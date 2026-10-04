// One import registers every c2-* tag with Volar, and carries the packages' Vue composables.
import { useRenderedRows } from '@c2n/components/vue'
import type { Table, TableRenderedRow } from '@c2n/components/table'
import type { GlobalComponents, MaybeRefOrGetter, Ref } from 'vue'

// The composable takes the table class the table entry exports: one declaration, not a copy per entry.
export const composable: (element: MaybeRefOrGetter<Table | null | undefined>) => Ref<TableRenderedRow[]> = useRenderedRows

type Tag = keyof GlobalComponents
export const tags: Tag[] = ['c2-button', 'c2-table', 'c2-line-chart', 'c2-chat-message']
// @ts-expect-error: a tag no package defines is not declared
export const unknown: Tag = 'c2-not-a-component'
