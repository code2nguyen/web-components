import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, computed, signal } from '@angular/core'
import { toast } from '@c2n/toast'
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
  template: `
    <div class="app">
      <header class="app__head">
        <div>
          <h1>Orders</h1>
          <p>{{ visible().length }} of {{ orders().length }} orders · {{ currency.format(revenue()) }} in revenue</p>
        </div>
        <c2-text-field type="search" clearable placeholder="Filter customer or id" (input)="query.set($any($event.target).value)"></c2-text-field>
      </header>

      <!-- A kebab-case custom event binds by its real name: Angular calls addEventListener('change', …) and
           hands the CustomEvent straight through. No wrapper, no synthetic event system in the way. -->
      <c2-tabs [attr.selected-tab]="filter()" (change)="filter.set($any($event).detail.value)">
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
        class="orders"
        [rows]="visible()"
        [rowKey]="'id'"
        [emptyMessage]="'No orders match this filter'"
        selection="single"
        sortable
        stripe
        (row-click)="openOrder($any($event).detail.row)"
      >
        <c2-table-column field="id" header="Order" width="130px" pinned="start"></c2-table-column>
        <c2-table-column field="customer" header="Customer" width="minmax(160px, 2fr)"></c2-table-column>
        <c2-table-column field="status" header="Status" width="130px" [renderCell]="renderStatus"></c2-table-column>
        <c2-table-column field="items" header="Items" width="90px" align="end" format="number"></c2-table-column>
        <c2-table-column field="total" header="Total" width="130px" align="end" format="currency" currency="USD"></c2-table-column>
        <c2-table-column field="placed" header="Placed" width="130px" format="date"></c2-table-column>
      </c2-table>

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
  protected readonly selected = signal<Order | null>(null)

  protected readonly visible = computed(() => {
    const needle = this.query().trim().toLowerCase()
    const status = this.filter()
    return this.orders()
      .filter((order) => status === 'all' || order.status === status)
      .filter((order) => !needle || `${order.id} ${order.customer}`.toLowerCase().includes(needle))
  })

  protected readonly revenue = computed(() => this.visible().reduce((sum, order) => sum + order.total, 0))

  protected tone(status: OrderStatus): string {
    return STATUS_TONE[status]
  }

  protected openOrder(order: Order): void {
    this.selected.set(order)
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
}
