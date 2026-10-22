import { useCallback, useMemo, useRef, useState } from 'react'
import type { Form, FormValidator } from '@c2n/components/form'
import type { Modal } from '@c2n/components/modal'
import type { Select } from '@c2n/components/select'
import { toast } from '@c2n/components/toast'
import { useCustomEvent } from './hooks/useCustomEvent'
import type { Position } from './data/positions'

export interface Order {
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  /** Limit price in cents: `c2-money-input` stores an integer count of minor units. */
  limit: number
}

interface OrderTicketProps {
  open: boolean
  /** The positions the ticket may trade: the table's selection. */
  positions: Position[]
  /** `placed` is true when the ticket closed because an order went through. */
  onClose: (placed: boolean) => void
  onPlace: (order: Order) => void
}

const cents = (price: number) => String(Math.round(price * 100))

/**
 * Numbers inside plain strings (an error message, a toast) cannot be a `c2-format-number` element, so they are
 * formatted in the page's language, the one the elements follow too.
 */
const format = (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(document.documentElement.lang || undefined, options).format(value)

/**
 * An order ticket for one of the selected positions, in a `c2-modal`.
 *
 * `c2-form` does the form work: every control is wrapped in a `c2-form-field` that labels it and shows its error,
 * a submit validates the whole form, and `valid-submit` only fires once it passes — including the app's own
 * `validator`, which knows how many shares are held. The values arrive as `FormData` entries, so the controls keep
 * their own state and React only reads them on submit: no controlled inputs to keep in step.
 */
export function OrderTicket({ open, positions, onClose, onPlace }: OrderTicketProps) {
  const modalRef = useRef<Modal>(null)
  const formRef = useRef<Form>(null)
  const symbolRef = useRef<Select>(null)

  // The ticket is priced when it opens or the symbol changes, not on every tick: a prop that changed on every
  // render would overwrite what the user is typing in the limit field.
  const [symbol, setSymbol] = useState(positions[0]?.symbol ?? '')
  const [limit, setLimit] = useState(() => cents(positions[0]?.price ?? 0))
  const pickSymbol = (next: string) => {
    setSymbol(next)
    setLimit(cents(positions.find((position) => position.symbol === next)?.price ?? 0))
  }

  const held = useMemo(() => new Map(positions.map((position) => [position.symbol, position.quantity])), [positions])
  const heldRef = useRef(held)
  heldRef.current = held

  // A function prop is assigned to the element as a property, like `rows` on the table. It is kept stable (reading
  // the holdings through a ref) so a price tick does not hand the form a new validator every 1.2 s.
  const validator = useCallback<FormValidator>((values) => {
    const quantity = Number(values.quantity)
    const owned = heldRef.current.get(String(values.symbol)) ?? 0
    return values.side === 'sell' && quantity > owned ? { quantity: `You hold ${format(owned)} shares of ${values.symbol}.` } : {}
  }, [])
  // Same for the select's `value`: a new array on every render would be written to the element on every tick.
  const symbolValue = useMemo(() => [symbol], [symbol])

  useCustomEvent(symbolRef, 'selection-change', (event) => pickSymbol(event.detail.value[0] ?? ''))
  useCustomEvent(modalRef, 'close', (event) => onClose(event.detail.returnValue === 'placed'))
  useCustomEvent(formRef, 'valid-submit', (event) => {
    const { values } = event.detail
    const order: Order = {
      symbol: String(values.symbol),
      side: values.side === 'sell' ? 'sell' : 'buy',
      quantity: Number(values.quantity),
      limit: Number(values.limit),
    }
    onPlace(order)
    toast.show({
      variant: 'success',
      heading: `${order.side === 'buy' ? 'Bought' : 'Sold'} ${format(order.quantity)} ${order.symbol}`,
      message: `Limit ${format(order.limit / 100, { style: 'currency', currency: 'USD' })}`,
    })
    modalRef.current?.close('placed')
  })

  return (
    <c2-modal ref={modalRef} open={open} className="ticket">
      <h2 slot="title">Order ticket</h2>
      <c2-form ref={formRef} validator={validator}>
        <form>
          <c2-form-field label="Symbol">
            <c2-select ref={symbolRef} name="symbol" value={symbolValue} required>
              {positions.map((position) => (
                <c2-list-item key={position.symbol} value={position.symbol}>
                  {position.symbol} · {position.name}
                </c2-list-item>
              ))}
            </c2-select>
          </c2-form-field>

          <c2-form-field label="Side">
            <c2-button-group name="side" selection="single" value="buy" stretched>
              <c2-button value="buy">Buy</c2-button>
              <c2-button value="sell">Sell</c2-button>
            </c2-button-group>
          </c2-form-field>

          <c2-form-field label="Quantity">
            <c2-number-input name="quantity" min={1} step="1" value="100" required />
            <span slot="hint">
              <c2-format-number value={held.get(symbol) ?? 0} /> shares held
            </span>
          </c2-form-field>

          {/* The amount is typed and grouped in the locale's format, and submitted as cents. Keyed by symbol, so
              picking another symbol re-prices the field even when both quote the same price. */}
          <c2-form-field label="Limit price">
            <c2-money-input key={symbol} name="limit" currency="USD" min="1" value={limit} required />
          </c2-form-field>

          <div className="ticket__actions">
            <c2-button className="ghost" type="button" onClick={() => modalRef.current?.close()}>
              Cancel
            </c2-button>
            <c2-button type="submit">Place order</c2-button>
          </div>
        </form>
      </c2-form>
    </c2-modal>
  )
}
