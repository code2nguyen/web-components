// Classes from several packages, through the barrel and through a per-package entry. An `export *` collision
// between two packages would drop the name from the barrel and fail here.
import { Button, LineChart, Select, Table, TableColumn, TextField } from '@c2n/components'
import { Table as TableFromEntry } from '@c2n/components/table'
import type { TableRow } from '@c2n/components/table'

const same: typeof Table = TableFromEntry
const row: TableRow = { id: 1 }

export const checks = [Button, LineChart, Select, TableColumn, TextField, same, row]
