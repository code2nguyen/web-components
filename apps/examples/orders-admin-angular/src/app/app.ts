import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, computed, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import type { SplitButtonEventMap } from '@c2n/components/split-button'
import type { Table, TableEventMap } from '@c2n/components/table'
import type { TabsEventMap } from '@c2n/components/tabs'
import type { ViewFieldConfig, ViewOptionsEventMap, ViewOptionsValue, ViewToggleConfig } from '@c2n/components/view-options'
import { C2_FORM_ACCESSORS } from '@c2n/angular'
import { toast } from '@c2n/components/toast'
import { ORDERS, STATUS_TONE, type Order, type OrderStatus } from './orders'

type Filter = 'all' | OrderStatus

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'paid', label: 'Paid' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'refunded', label: 'Refunded' },
]

/** What the Display popover offers. One array, so the popover and the table columns cannot drift apart. */
const VIEW_FIELDS: ViewFieldConfig[] = [
  { id: 'customer', label: 'Customer', orderable: true, property: true },
  { id: 'status', label: 'Status', groupable: true, orderable: true, property: true },
  { id: 'items', label: 'Items', orderable: true, property: true },
  { id: 'total', label: 'Total', orderable: true, property: true },
  { id: 'placed', label: 'Placed', groupable: true, orderable: true, property: true },
]

const VIEW_TOGGLES: ViewToggleConfig[] = [{ key: 'refunded', label: 'Refunded orders', checked: true }]

const DEFAULT_VIEW: ViewOptionsValue = {
  layout: 'table',
  groupBy: null,
  subGroupBy: null,
  orderBy: [{ field: 'placed', direction: 'desc' }],
  show: Object.fromEntries(VIEW_TOGGLES.map((toggle) => [toggle.key, toggle.checked ?? false])),
  properties: VIEW_FIELDS.map((field) => field.id),
}

const NEXT_STATUS: Record<OrderStatus, OrderStatus> = { pending: 'paid', paid: 'shipped', shipped: 'shipped', refunded: 'refunded' }

/** An order only moves forward (pending → paid → shipped), any order can be refunded, and a refund is final. */
const STATUS_RANK: Record<OrderStatus, number> = { pending: 0, paid: 1, shipped: 2, refunded: 3 }
const moveTo = (target: OrderStatus) => (order: Order) =>
  order.status !== 'refunded' && (target === 'refunded' || STATUS_RANK[target] > STATUS_RANK[order.status]) ? target : order.status

const sameFields = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((field, index) => field === b[index])

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Without this Angular rejects every `c2-*` tag as an unknown element. It is the one piece of Angular
  // configuration these components need; property and event bindings then work with no wrapper at all.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  // `C2_FORM_ACCESSORS` is what lets `ngModel` reach a c2 form control. Angular's built-in value accessors match
  // `input`, `select` and `textarea` only, so without them the components are invisible to Angular forms however
  // correct their `ElementInternals` are — the binding silently does nothing.
  imports: [FormsModule, ...C2_FORM_ACCESSORS],
  template: `
    <div class="app">
      <header class="app__head">
        <div>
          <h1>Orders</h1>
          <!-- c2-format-number formats in the page's language: the app keeps no Intl formatter of its own. -->
          <p>
            {{ visible().length }} of {{ orders().length }} orders · <c2-format-number type="currency" currency="USD" [value]="revenue()"></c2-format-number> in
            revenue
          </p>
        </div>
        <div class="app__controls">
          <!-- Two-way binding through the ControlValueAccessor in @c2n/angular. A banana-in-a-box needs a plain
               writable reference, so the signal is written from (ngModelChange) instead. -->
          <c2-text-field
            type="search"
            clearable
            placeholder="Filter customer or id"
            [ngModel]="query()"
            (ngModelChange)="query.set($any($event))"
            name="query"
          ></c2-text-field>
          <c2-switch [ngModel]="openOnly()" (ngModelChange)="openOnly.set($any($event))" name="openOnly">Unshipped only</c2-switch>

          <!-- The "Display" popover edits one value — grouping, ordering, which columns show — and fires view-change
               with the whole of it. It renders no rows itself: the table below is bound to the value. Reset returns
               to [defaultValue], and the trigger shows a dot while the view differs from it. -->
          <c2-view-options
            [fields]="viewFields"
            [toggles]="viewToggles"
            [value]="view()"
            [defaultValue]="defaultView"
            (view-change)="handleViewChange($event)"
          ></c2-view-options>
        </div>
      </header>

      <!-- A kebab-case custom event binds by its real name: Angular calls addEventListener('selection-change', …)
           and hands the CustomEvent straight through. No wrapper, no synthetic event system in the way.

           CUSTOM_ELEMENTS_SCHEMA turns off type checking for these tags, so $event is a bare Event in the
           template. The handlers below take the component's own event-map type, which is where the detail gets
           its shape — one cast in one place instead of $any at every call site. -->
      <c2-tabs [selectedTab]="filter()" (selection-change)="handleFilterChange($event)">
        @for (tab of filters; track tab.id) {
          <c2-tab [attr.for]="tab.id">{{ tab.label }}</c2-tab>
        }
        @for (tab of filters; track tab.id) {
          <div [id]="tab.id"></div>
        }
      </c2-tabs>

      <!-- [rows] is an object array. Angular writes every [property] binding with setProperty, so it lands on
           the element as a property — no JSON round-trip, no attribute stringification.

           A *static* attribute in an Angular template stays an attribute, so it has to be spelled the way the
           component declares it: row-key and empty-message, not rowKey and emptyMessage. Those camelCase names
           only work through a property binding, which is why they are written as [rowKey] / [emptyMessage]
           below. React 19 hides this difference by checking the property first; Angular does not. -->
      <c2-table
        #table
        class="orders"
        [rows]="visible()"
        [rowKey]="'id'"
        [emptyMessage]="'No orders match this filter'"
        [groupBy]="groupBy()"
        [sortModel]="view().orderBy"
        selection="multiple"
        checkbox-selection
        sortable
        multi-sort
        stripe
        (selection-change)="handleSelectionChange($event)"
        (sort-change)="handleSortChange($event)"
      >
        <!-- The view's orderBy is the table's own sortModel, and a header click reports back through (sort-change),
             so the popover and the headers always show the same ordering. A plain click sorts by that column alone;
             multi-sort lets a Shift+click add a level, like the popover's Add sort. -->
        <c2-table-column field="id" header="Order" width="130px" pinned="start" [renderCell]="renderOrderLink"></c2-table-column>
        <c2-table-column field="customer" header="Customer" width="minmax(160px, 2fr)" [hidden]="!shows('customer')"></c2-table-column>
        <c2-table-column field="status" header="Status" width="130px" [renderCell]="renderStatus" [hidden]="!shows('status')"></c2-table-column>
        <c2-table-column field="items" header="Items" width="90px" align="end" format="number" [hidden]="!shows('items')"></c2-table-column>
        <c2-table-column field="total" header="Total" width="130px" align="end" format="currency" currency="USD" [hidden]="!shows('total')"></c2-table-column>
        <c2-table-column field="placed" header="Placed" width="130px" format="date" [hidden]="!shows('placed')"></c2-table-column>
      </c2-table>

      <!-- The bar shows while count is above zero and floats over the bottom of the page. It does not own the
           selection: (clear), its × button or Escape, is where the table's selection is emptied. -->
      <c2-action-bar [count]="checkedVisible().length" (clear)="clearChecked(table)">
        <!-- One common action and its alternatives: the main half fires (action), a row fires (menu-select) with
             its value. Listen for (action) rather than (click), since clicks on the menu rows bubble through. -->
        <c2-split-button (action)="advanceChecked(table)" (menu-select)="handleBulkStatus($event, table)">
          Advance status
          <c2-menu-item slot="menu" value="paid">Mark as paid</c2-menu-item>
          <c2-menu-item slot="menu" value="shipped">Mark as shipped</c2-menu-item>
          <hr slot="menu" />
          <c2-menu-item slot="menu" value="refunded">Refund</c2-menu-item>
        </c2-split-button>
      </c2-action-bar>

      <!-- open is a plain property, so the dialog is driven by state rather than by calling show() on an element ref. -->
      <c2-modal [open]="!!selected()" (close)="selected.set(null)">
        <h2 slot="title">{{ selected()?.id }}</h2>
        @if (selected(); as order) {
          <dl class="detail">
            <dt>Customer</dt>
            <dd>{{ order.customer }}</dd>
            <dt>Email</dt>
            <dd>{{ order.email }}</dd>
            <dt>Status</dt>
            <dd>
              <c2-badge [attr.tone]="tone(order.status)">{{ order.status }}</c2-badge>
            </dd>
            <dt>Items</dt>
            <dd>{{ order.items }}</dd>
            <dt>Total</dt>
            <dd><c2-format-number type="currency" currency="USD" [value]="order.total"></c2-format-number></dd>
          </dl>
        }
        <c2-button slot="footer" class="ghost" (click)="selected.set(null)">Close</c2-button>
        <c2-button slot="footer" (click)="advance()">Advance status</c2-button>
      </c2-modal>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class App {
  protected readonly filters = FILTERS
  protected readonly viewFields = VIEW_FIELDS
  protected readonly viewToggles = VIEW_TOGGLES
  protected readonly defaultView = DEFAULT_VIEW
  /** The Display settings. A real app would keep them with the user's preferences; the popover stores nothing. */
  protected readonly view = signal<ViewOptionsValue>(DEFAULT_VIEW)
  // Only a change of the grouping fields hands the table a new array: a new one on every view edit would regroup it.
  protected readonly groupBy = computed(() => [this.view().groupBy, this.view().subGroupBy].filter((field): field is string => field !== null), {
    equal: sameFields,
  })

  protected readonly orders = signal<Order[]>(ORDERS)
  protected readonly filter = signal<Filter>('all')
  protected readonly query = signal('')
  protected readonly openOnly = signal(false)
  protected readonly selected = signal<Order | null>(null)
  /** Keys of the rows ticked in the table. */
  protected readonly checked = signal<string[]>([])
  /**
   * The ticked rows the filter still shows. The table keeps a hidden row's key selected, so the bar counts and the
   * bulk actions apply to these only: a search must not leave an order the user cannot see in a bulk refund.
   */
  protected readonly checkedVisible = computed(() => {
    const keys = new Set(this.checked())
    return this.visible().filter((order) => keys.has(order.id))
  })

  protected readonly visible = computed(() => {
    const needle = this.query().trim().toLowerCase()
    const status = this.filter()
    return (
      this.orders()
        .filter((order) => status === 'all' || order.status === status)
        .filter((order) => !this.openOnly() || order.status === 'pending' || order.status === 'paid')
        // The Refunded tab asks for refunded orders, so it wins over the Display switch that hides them elsewhere.
        .filter((order) => status === 'refunded' || this.view().show['refunded'] || order.status !== 'refunded')
        .filter((order) => !needle || `${order.id} ${order.customer}`.toLowerCase().includes(needle))
    )
  })

  protected readonly revenue = computed(() => this.visible().reduce((sum, order) => sum + order.total, 0))

  protected tone(status: OrderStatus): string {
    return STATUS_TONE[status]
  }

  protected handleFilterChange(event: Event): void {
    this.filter.set((event as TabsEventMap['selection-change']).detail.value as Filter)
  }

  protected shows(field: string): boolean {
    return this.view().properties.includes(field)
  }

  protected handleViewChange(event: Event): void {
    this.view.set((event as ViewOptionsEventMap['view-change']).detail.value)
  }

  protected handleSortChange(event: Event): void {
    const orderBy = (event as TableEventMap['sort-change']).detail.sort
    this.view.update((view) => ({ ...view, orderBy }))
  }

  protected handleBulkStatus(event: Event, table: HTMLElement): void {
    const status = (event as SplitButtonEventMap['menu-select']).detail.value as OrderStatus
    this.updateChecked(table, moveTo(status), status === 'refunded' ? 'refunded' : `marked ${status}`)
  }

  protected handleSelectionChange(event: Event): void {
    this.checked.set((event as TableEventMap['selection-change']).detail.value)
  }

  /**
   * The order id opens its details. A row click is the table's own selection gesture, which with
   * `selection="multiple"` narrows the selection to that row, so opening details from it would drop the ticked rows.
   * The click stops at the link: the table never sees it, so the selection stays as it was.
   */
  protected readonly renderOrderLink = ({ row }: { row: Record<string, unknown> }) => {
    const order = row as unknown as Order
    const link = document.createElement('c2-link-button')
    link.textContent = order.id
    link.addEventListener('click', (event) => {
      event.stopPropagation()
      this.selected.set(order)
    })
    return link
  }

  /**
   * `renderCell` is handed to Lit, so it cannot return an Angular template. A DOM node works in any framework,
   * and a `c2-badge` element is just a DOM node — the component renders itself once it is in the tree.
   */
  protected readonly renderStatus = ({ value }: { value: unknown }) => {
    const status = String(value) as OrderStatus
    const badge = document.createElement('c2-badge')
    badge.setAttribute('tone', STATUS_TONE[status] ?? 'neutral')
    badge.textContent = status
    return badge
  }

  protected advance(): void {
    const order = this.selected()
    if (!order) return

    const status = NEXT_STATUS[order.status]

    this.orders.update((orders) => orders.map((candidate) => (candidate.id === order.id ? { ...candidate, status } : candidate)))
    this.selected.set(null)
    toast.show({ variant: 'success', heading: order.id, message: `Status is now ${status}.` })
  }

  protected advanceChecked(table: HTMLElement): void {
    this.updateChecked(table, (order) => NEXT_STATUS[order.status], 'advanced')
  }

  /**
   * Empties the selection, which hides the action bar and its buttons with it, so focus goes back to the table's
   * current cell rather than dropping to the page.
   */
  protected clearChecked(table: HTMLElement): void {
    ;(table as Table).clearSelection()
    table.focus()
  }

  /** Applies a status to the checked orders; an order the rule leaves where it is does not count as changed. */
  private updateChecked(table: HTMLElement, status: (order: Order) => OrderStatus, verb: string): void {
    const changes = new Map(
      this.checkedVisible()
        .map((order) => [order.id, status(order)] as const)
        .filter(([id, next]) => next !== this.orders().find((order) => order.id === id)?.status),
    )
    const skipped = this.checkedVisible().length - changes.size
    this.orders.update((orders) =>
      orders.map((order) => {
        const next = changes.get(order.id)
        return next ? { ...order, status: next } : order
      }),
    )
    this.clearChecked(table)
    toast.show({
      variant: changes.size ? 'success' : 'neutral',
      heading: `${changes.size} ${changes.size === 1 ? 'order' : 'orders'} ${verb}`,
      message: skipped
        ? `${skipped} left as ${skipped === 1 ? 'it was' : 'they were'}: an order only moves forward, and a refund is final.`
        : 'The table shows their new status.',
    })
  }
}
