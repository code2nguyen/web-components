import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, computed, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import type { Table, TableEventMap } from '@c2n/components/table'
import type { TabsEventMap } from '@c2n/components/tabs'
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
          <p>{{ visible().length }} of {{ orders().length }} orders · {{ currency.format(revenue()) }} in revenue</p>
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
        selection="multiple"
        checkbox-selection
        sortable
        stripe
        (selection-change)="handleSelectionChange($event)"
      >
        <c2-table-column field="id" header="Order" width="130px" pinned="start" [renderCell]="renderOrderLink"></c2-table-column>
        <c2-table-column field="customer" header="Customer" width="minmax(160px, 2fr)"></c2-table-column>
        <c2-table-column field="status" header="Status" width="130px" [renderCell]="renderStatus"></c2-table-column>
        <c2-table-column field="items" header="Items" width="90px" align="end" format="number"></c2-table-column>
        <c2-table-column field="total" header="Total" width="130px" align="end" format="currency" currency="USD"></c2-table-column>
        <c2-table-column field="placed" header="Placed" width="130px" format="date"></c2-table-column>
      </c2-table>

      <!-- The bar shows while count is above zero and floats over the bottom of the page. It does not own the
           selection: (clear), its × button or Escape, is where the table's selection is emptied. -->
      <c2-action-bar [count]="checkedVisible().length" (clear)="clearChecked(table)">
        <c2-button class="ghost" (click)="refundChecked(table)">Refund</c2-button>
        <c2-button (click)="advanceChecked(table)">Advance status</c2-button>
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
            <dd>{{ currency.format(order.total) }}</dd>
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
  protected readonly currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })

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
    return this.orders()
      .filter((order) => status === 'all' || order.status === status)
      .filter((order) => !this.openOnly() || order.status === 'pending' || order.status === 'paid')
      .filter((order) => !needle || `${order.id} ${order.customer}`.toLowerCase().includes(needle))
  })

  protected readonly revenue = computed(() => this.visible().reduce((sum, order) => sum + order.total, 0))

  protected tone(status: OrderStatus): string {
    return STATUS_TONE[status]
  }

  protected handleFilterChange(event: Event): void {
    this.filter.set((event as TabsEventMap['selection-change']).detail.value as Filter)
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

    const next: Record<OrderStatus, OrderStatus> = { pending: 'paid', paid: 'shipped', shipped: 'shipped', refunded: 'refunded' }
    const status = next[order.status]

    this.orders.update((orders) => orders.map((candidate) => (candidate.id === order.id ? { ...candidate, status } : candidate)))
    this.selected.set(null)
    toast.show({ variant: 'success', heading: order.id, message: `Status is now ${status}.` })
  }

  protected advanceChecked(table: HTMLElement): void {
    const next: Record<OrderStatus, OrderStatus> = { pending: 'paid', paid: 'shipped', shipped: 'shipped', refunded: 'refunded' }
    this.updateChecked(table, (order) => next[order.status], 'advanced')
  }

  protected refundChecked(table: HTMLElement): void {
    this.updateChecked(table, () => 'refunded', 'refunded')
  }

  /**
   * Empties the selection, which hides the action bar and its buttons with it. Focus should go back to the table
   * then, but `c2-table` cannot be focused from outside yet (see COMPONENT-FEEDBACK.md).
   */
  protected clearChecked(table: HTMLElement): void {
    ;(table as Table).clearSelection()
  }

  private updateChecked(table: HTMLElement, status: (order: Order) => OrderStatus, verb: string): void {
    const keys = new Set(this.checkedVisible().map((order) => order.id))
    this.orders.update((orders) => orders.map((order) => (keys.has(order.id) ? { ...order, status: status(order) } : order)))
    this.clearChecked(table)
    toast.show({ variant: 'success', heading: `${keys.size} orders ${verb}`, message: 'The table shows their new status.' })
  }
}
