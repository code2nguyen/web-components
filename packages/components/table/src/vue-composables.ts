/**
 * Vue 3 composables for `c2-table`. `vue` is an optional peer dependency of `@c2n/table`: only an application that
 * imports this module needs it, and the component itself never loads it.
 *
 * ```vue
 * <script setup lang="ts">
 * import { useTemplateRef } from 'vue'
 * import { useRenderedRows } from '@c2n/table/vue-composables.js'
 *
 * const table = useTemplateRef<HTMLElementTagNameMap['c2-table']>('table')
 * const rendered = useRenderedRows(table)
 * </script>
 *
 * <template>
 *   <c2-table ref="table" row-key="id" :rows.prop="rows">
 *     <c2-table-column field="status" header="Status" cell-slot></c2-table-column>
 *     <span v-for="{ line, key, row } in rendered" :key="key" :slot="`cell:${line}:status`">{{ row.status }}</span>
 *   </c2-table>
 * </template>
 * ```
 */
import { shallowRef, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import { subscribeRenderedRows } from './rendered-rows.js'
import type { Table } from './table.js'
import type { TableRenderedRow } from './table-types.js'

/**
 * The data rows a `c2-table` has rendered, as `{ line, key, row }`: the lines a `cell-slot` column needs children for
 * (`slot="cell:{line}:{field}"`).
 *
 * The table renders only a window of lines and names a slotted cell by its display line, so render children for
 * exactly these rows. A sort, filter or page change puts other rows on the same lines and fires `range-change`
 * again, which replaces the ref's value.
 *
 * - `element` is a template ref, any ref or a getter; `null` while it is not mounted.
 * - Seeded from the table's `renderedRange`, since the table may have rendered before the watcher subscribes.
 * - Re-subscribes when the element changes (a `v-if`, a keyed remount), resetting to `[]` in between, and
 *   unsubscribes when the calling component unmounts or its effect scope stops.
 * - SSR-safe: on the server and until the element upgrades the value is `[]`, so every `cell-slot` cell shows the
 *   column's own `renderCell` or formatted value.
 */
export function useRenderedRows(element: MaybeRefOrGetter<Table | null | undefined>): Ref<TableRenderedRow[]> {
  const rendered = shallowRef<TableRenderedRow[]>([])
  watch(
    () => toValue(element),
    (table, _previous, onCleanup) => {
      if (rendered.value.length) rendered.value = []
      onCleanup(subscribeRenderedRows(table, (rows) => (rendered.value = rows)))
    },
    // `post`: a template ref is assigned while the DOM is patched, so read it after the patch.
    { immediate: true, flush: 'post' },
  )
  return rendered
}
