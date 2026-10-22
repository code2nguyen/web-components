import type { BadgeTone } from '@c2n/components/badge'
import { findMatches } from '@c2n/components/highlight'

export type Status = 'open' | 'waiting' | 'closed'

export interface Message {
  id: string
  /** `agent` messages are the support team's replies; they are aligned to the right in the thread. */
  from: 'customer' | 'agent'
  author: string
  body: string
  /** When the message was sent. A real instant rather than display text: the UI formats it in the reader's language. */
  at: Date
}

export interface Conversation {
  id: string
  customer: string
  email: string
  plan: 'Free' | 'Team' | 'Enterprise'
  subject: string
  status: Status
  unread: number
  messages: Message[]
}

/** The sample is dated relative to page load, so its times always read as recent. */
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

/** A conversation was last active when its latest message was sent. */
export const lastActivity = (conversation: Conversation) => conversation.messages[conversation.messages.length - 1].at

/**
 * How the search matches. `findMatches` is the matcher `c2-highlight` marks text with, and the list binds these same
 * options onto its highlights, so a row is listed exactly when one of its highlights shows a match: "bergstrom"
 * finds "Bergström" because both ignore accents.
 */
export const MATCH_OPTIONS = { ignoreAccents: true } as const

/** The customer and the subject are separate highlights, so each is matched on its own. */
export const matchesQuery = (conversation: Conversation, query: string) =>
  [conversation.customer, conversation.subject].some((text) => findMatches(text, query, MATCH_OPTIONS).length > 0)

// `BadgeTone` rather than `string`: the generated Vue types check `:tone`, so the union is what keeps a typo here
// from reaching the template.
export const STATUS_TONE: Record<Status, BadgeTone> = {
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
    messages: [
      {
        id: 'm1',
        from: 'customer',
        author: 'Mireille Dufort',
        body: 'Since this morning our SAML sign-in bounces everyone back to the login page. The IdP says the assertion was sent.',
        at: minutesAgo(47),
      },
      {
        id: 'm2',
        from: 'agent',
        author: 'You',
        body: 'Thanks — I can see the failed callbacks on our side. Did anything change in the IdP certificate?',
        at: minutesAgo(40),
      },
      {
        id: 'm3',
        from: 'customer',
        author: 'Mireille Dufort',
        body: 'Our security team rotated it on Friday. Should we send you the new metadata?',
        at: minutesAgo(30),
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
    messages: [
      {
        id: 'm1',
        from: 'customer',
        author: 'Tobias Renner',
        body: 'We were charged twice for invoice 2291. Same amount, two minutes apart.',
        at: minutesAgo(1560),
      },
      {
        id: 'm2',
        from: 'agent',
        author: 'You',
        body: '**Confirmed** — the second charge was a retry after a timeout.\n\n- Refunded `INV-2291-B` just now\n- It shows on your statement within 1–2 days\n\nCould you check tomorrow?',
        at: minutesAgo(1535),
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
    messages: [
      {
        id: 'm1',
        from: 'customer',
        author: 'Aiko Tanaka',
        body: 'Our nightly export hits 429 after roughly 300 requests. The docs mention 1000/hour.',
        at: minutesAgo(2950),
      },
      {
        id: 'm2',
        from: 'agent',
        author: 'You',
        body: 'The burst limit is lower than the hourly one. I can raise it for your workspace — what concurrency do you need?',
        at: minutesAgo(2916),
      },
      { id: 'm3', from: 'customer', author: 'Aiko Tanaka', body: 'Eight workers, so about 20 requests per second at the peak.', at: minutesAgo(2903) },
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
    messages: [
      {
        id: 'm1',
        from: 'customer',
        author: 'Paulo Marques',
        body: 'Is there a way to move a project between workspaces without exporting everything?',
        at: minutesAgo(3600),
      },
      {
        id: 'm2',
        from: 'agent',
        author: 'You',
        body: 'Yes — project settings, then "Move workspace". Members keep their roles if they belong to both.',
        at: minutesAgo(3586),
      },
      { id: 'm3', from: 'customer', author: 'Paulo Marques', body: 'Worked perfectly, thank you!', at: minutesAgo(3579) },
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
    messages: [
      {
        id: 'm1',
        from: 'customer',
        author: 'Hanna Bergström',
        body: 'After rotating the signing key every webhook fails verification, including replays of old events.',
        at: minutesAgo(7200),
      },
      {
        id: 'm2',
        from: 'agent',
        author: 'You',
        body: 'Old events are signed with the old key — both stay valid for 24h. Are you verifying against the key id in the header?',
        at: minutesAgo(7176),
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
    messages: [
      {
        id: 'm1',
        from: 'customer',
        author: 'Dmitri Volkov',
        body: 'Compliance needs 12 months of audit logs. Is longer retention available on our plan?',
        at: minutesAgo(7500),
      },
      {
        id: 'm2',
        from: 'agent',
        author: 'You',
        body: 'Enterprise can go to 12 months. I will check whether it can be enabled on the current contract.',
        at: minutesAgo(7465),
      },
      { id: 'm3', from: 'customer', author: 'Dmitri Volkov', body: 'Any update? Our audit starts in two weeks.', at: minutesAgo(7062) },
    ],
  },
]
