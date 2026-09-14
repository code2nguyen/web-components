export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'refunded'

export interface Order {
  id: string
  customer: string
  email: string
  status: OrderStatus
  items: number
  total: number
  placed: string
  [key: string]: unknown
}

export const STATUS_TONE: Record<OrderStatus, string> = {
  pending: 'warning',
  paid: 'info',
  shipped: 'success',
  refunded: 'neutral',
}

export const ORDERS: Order[] = [
  { id: 'ORD-4821', customer: 'Ada Lovelace', email: 'ada@example.com', status: 'paid', items: 3, total: 248.5, placed: '2026-09-02' },
  { id: 'ORD-4822', customer: 'Grace Hopper', email: 'grace@example.com', status: 'shipped', items: 1, total: 79.0, placed: '2026-09-02' },
  { id: 'ORD-4823', customer: 'Alan Turing', email: 'alan@example.com', status: 'pending', items: 7, total: 1024.0, placed: '2026-09-03' },
  { id: 'ORD-4824', customer: 'Katherine Johnson', email: 'katherine@example.com', status: 'paid', items: 2, total: 156.25, placed: '2026-09-04' },
  { id: 'ORD-4825', customer: 'Hedy Lamarr', email: 'hedy@example.com', status: 'refunded', items: 4, total: 312.8, placed: '2026-09-04' },
  { id: 'ORD-4826', customer: 'Barbara Liskov', email: 'barbara@example.com', status: 'shipped', items: 5, total: 489.9, placed: '2026-09-05' },
  { id: 'ORD-4827', customer: 'Margaret Hamilton', email: 'margaret@example.com', status: 'pending', items: 2, total: 98.4, placed: '2026-09-06' },
  { id: 'ORD-4828', customer: 'Radia Perlman', email: 'radia@example.com', status: 'paid', items: 6, total: 742.15, placed: '2026-09-06' },
  { id: 'ORD-4829', customer: 'Shafi Goldwasser', email: 'shafi@example.com', status: 'shipped', items: 1, total: 45.0, placed: '2026-09-07' },
  { id: 'ORD-4830', customer: 'Frances Allen', email: 'frances@example.com', status: 'pending', items: 3, total: 209.99, placed: '2026-09-08' },
]
