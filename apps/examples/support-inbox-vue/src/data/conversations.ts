export type Status = 'open' | 'waiting' | 'closed'

export interface Message {
  id: string
  /** `agent` messages are the support team's replies; they are aligned to the right in the thread. */
  from: 'customer' | 'agent'
  author: string
  body: string
  at: string
}

export interface Conversation {
  id: string
  customer: string
  email: string
  plan: 'Free' | 'Team' | 'Enterprise'
  subject: string
  status: Status
  unread: number
  updated: string
  messages: Message[]
}

export const STATUS_TONE: Record<Status, string> = {
  open: 'primary',
  waiting: 'warning',
  closed: 'neutral',
}

export const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  waiting: 'Waiting on customer',
  closed: 'Closed',
}

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'C-4821',
    customer: 'Mireille Dufort',
    email: 'mireille@northwind.example',
    plan: 'Enterprise',
    subject: 'SSO login loops back to the sign-in page',
    status: 'open',
    unread: 2,
    updated: '9:12',
    messages: [
      {
        id: 'm1',
        from: 'customer',
        author: 'Mireille Dufort',
        body: 'Since this morning our SAML sign-in bounces everyone back to the login page. The IdP says the assertion was sent.',
        at: '08:55',
      },
      {
        id: 'm2',
        from: 'agent',
        author: 'You',
        body: 'Thanks — I can see the failed callbacks on our side. Did anything change in the IdP certificate?',
        at: '09:02',
      },
      {
        id: 'm3',
        from: 'customer',
        author: 'Mireille Dufort',
        body: 'Our security team rotated it on Friday. Should we send you the new metadata?',
        at: '09:12',
      },
    ],
  },
  {
    id: 'C-4817',
    customer: 'Tobias Renner',
    email: 'tobias@lattice.example',
    plan: 'Team',
    subject: 'Invoice 2291 charged twice',
    status: 'waiting',
    unread: 0,
    updated: 'Yest.',
    messages: [
      { id: 'm1', from: 'customer', author: 'Tobias Renner', body: 'We were charged twice for invoice 2291. Same amount, two minutes apart.', at: 'Tue 16:40' },
      {
        id: 'm2',
        from: 'agent',
        author: 'You',
        body: 'Confirmed, the second charge was a retry after a timeout. I refunded it — could you check your statement tomorrow?',
        at: 'Tue 17:05',
      },
    ],
  },
  {
    id: 'C-4809',
    customer: 'Aiko Tanaka',
    email: 'aiko@meridian.example',
    plan: 'Enterprise',
    subject: 'Export API returns 429 under load',
    status: 'open',
    unread: 1,
    updated: 'Mon',
    messages: [
      {
        id: 'm1',
        from: 'customer',
        author: 'Aiko Tanaka',
        body: 'Our nightly export hits 429 after roughly 300 requests. The docs mention 1000/hour.',
        at: 'Mon 22:14',
      },
      {
        id: 'm2',
        from: 'agent',
        author: 'You',
        body: 'The burst limit is lower than the hourly one. I can raise it for your workspace — what concurrency do you need?',
        at: 'Mon 22:48',
      },
      { id: 'm3', from: 'customer', author: 'Aiko Tanaka', body: 'Eight workers, so about 20 requests per second at the peak.', at: 'Mon 23:01' },
    ],
  },
  {
    id: 'C-4802',
    customer: 'Paulo Marques',
    email: 'paulo@brava.example',
    plan: 'Free',
    subject: 'How do I move a project to another workspace?',
    status: 'closed',
    unread: 0,
    updated: 'Mon',
    messages: [
      {
        id: 'm1',
        from: 'customer',
        author: 'Paulo Marques',
        body: 'Is there a way to move a project between workspaces without exporting everything?',
        at: 'Mon 11:20',
      },
      {
        id: 'm2',
        from: 'agent',
        author: 'You',
        body: 'Yes — project settings, then "Move workspace". Members keep their roles if they belong to both.',
        at: 'Mon 11:34',
      },
      { id: 'm3', from: 'customer', author: 'Paulo Marques', body: 'Worked perfectly, thank you!', at: 'Mon 11:41' },
    ],
  },
  {
    id: 'C-4795',
    customer: 'Hanna Bergström',
    email: 'hanna@vinterlys.example',
    plan: 'Team',
    subject: 'Webhook signatures fail after key rotation',
    status: 'waiting',
    unread: 0,
    updated: 'Fri',
    messages: [
      {
        id: 'm1',
        from: 'customer',
        author: 'Hanna Bergström',
        body: 'After rotating the signing key every webhook fails verification, including replays of old events.',
        at: 'Fri 14:02',
      },
      {
        id: 'm2',
        from: 'agent',
        author: 'You',
        body: 'Old events are signed with the old key — both stay valid for 24h. Are you verifying against the key id in the header?',
        at: 'Fri 14:26',
      },
    ],
  },
  {
    id: 'C-4788',
    customer: 'Dmitri Volkov',
    email: 'dmitri@sable.example',
    plan: 'Enterprise',
    subject: 'Request: audit log retention beyond 90 days',
    status: 'open',
    unread: 3,
    updated: 'Fri',
    messages: [
      {
        id: 'm1',
        from: 'customer',
        author: 'Dmitri Volkov',
        body: 'Compliance needs 12 months of audit logs. Is longer retention available on our plan?',
        at: 'Fri 09:30',
      },
      {
        id: 'm2',
        from: 'agent',
        author: 'You',
        body: 'Enterprise can go to 12 months. I will check whether it can be enabled on the current contract.',
        at: 'Fri 10:05',
      },
      { id: 'm3', from: 'customer', author: 'Dmitri Volkov', body: 'Any update? Our audit starts in two weeks.', at: 'Fri 16:48' },
    ],
  },
]
