/**
 * JSX types for the c2 elements used here.
 *
 * The packages declare `HTMLElementTagNameMap` (which is what `document.querySelector` reads), but JSX has its
 * own registry, so a React consumer has to map the tags once. Deriving the props from each element class keeps
 * that mapping honest: every public property of the component is accepted and typed, and a renamed or removed
 * property breaks the build here rather than silently doing nothing at runtime.
 */
import type { DetailedHTMLProps, HTMLAttributes } from 'react'
import type { Badge } from '@c2n/badge'
import type { Button } from '@c2n/button'
import type { Card } from '@c2n/card'
import type { ListItem } from '@c2n/list-item'
import type { Select } from '@c2n/select'
import type { Switch } from '@c2n/switch'
import type { Table } from '@c2n/table'
import type { TableColumn } from '@c2n/table/table-column.js'
import type { TextField } from '@c2n/text-field'

/** Standard HTML/React attributes plus the element's own public properties. */
type C2Element<T> = DetailedHTMLProps<HTMLAttributes<T>, T> & Partial<Omit<T, keyof HTMLElement>>

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'c2-badge': C2Element<Badge>
      'c2-button': C2Element<Button>
      'c2-card': C2Element<Card>
      'c2-list-item': C2Element<ListItem>
      'c2-select': C2Element<Select>
      'c2-switch': C2Element<Switch>
      'c2-table': C2Element<Table>
      'c2-table-column': C2Element<TableColumn>
      'c2-text-field': C2Element<TextField>
    }
  }
}
