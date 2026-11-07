/**
 * The page's copy and lists, kept out of the templates so the sections stay markup. Wayline and every company, person
 * and figure here are made up for this example.
 */

export const product = {
  name: 'Wayline',
  tagline: 'Automate the busywork between your tools.',
  description:
    'Wayline connects the apps your team already uses and runs the hand-offs between them: route a request, sync a record, ask for an approval, all without a line of glue code.',
}

/** The words the hero headline rotates through. */
export const heroWords = ['CRM', 'inbox', 'help desk', 'billing', 'warehouse']

export const customers = ['Northwind', 'Contoso', 'Fabrikam', 'Tailspin', 'Litware', 'Proseware', 'Adatum', 'Woodgrove']

export interface Workflow {
  name: string
  trigger: string
  runs: string
  status: 'Running' | 'Paused' | 'Failed'
}

/** The rows of the dashboard drawn inside the hero's browser frame. */
export const workflows: Workflow[] = [
  { name: 'Route new leads to sales', trigger: 'Form submitted', runs: '1,284', status: 'Running' },
  { name: 'Sync invoices to the ledger', trigger: 'Invoice paid', runs: '932', status: 'Running' },
  { name: 'Escalate urgent tickets', trigger: 'Ticket tagged', runs: '211', status: 'Failed' },
  { name: 'Welcome new customers', trigger: 'Deal won', runs: '96', status: 'Paused' },
]

export interface Integration {
  id: string
  label: string
  icon: string
}

/** The integration hub: triggers on the left, actions on the right. */
export const triggers: Integration[] = [
  { id: 'hub-mail', label: 'Email', icon: 'mail' },
  { id: 'hub-forms', label: 'Forms', icon: 'file-text' },
  { id: 'hub-crm', label: 'CRM', icon: 'users' },
]

export const actions: Integration[] = [
  { id: 'hub-chat', label: 'Chat', icon: 'message-square' },
  { id: 'hub-billing', label: 'Billing', icon: 'credit-card' },
  { id: 'hub-data', label: 'Warehouse', icon: 'database' },
]

export const stats = [
  { value: '12M', label: 'Tasks run every month' },
  { value: '99.98%', label: 'Uptime over the last year' },
  { value: '400+', label: 'Ready-made connectors' },
]

export interface Feature {
  icon: string
  title: string
  text: string
}

export const features: Feature[] = [
  { icon: 'zap', title: 'Triggers in seconds', text: 'Start a workflow from a form, an email, a webhook or a change in any connected app.' },
  { icon: 'git-branch', title: 'Branches and conditions', text: 'Send each record down its own path with plain-language rules your whole team can read.' },
  { icon: 'check-circle', title: 'Human approvals', text: 'Pause for a sign-off and resume the moment someone approves, on the web or on their phone.' },
  { icon: 'refresh-cw', title: 'Retries that make sense', text: 'Failed steps retry with back-off and tell you exactly which record and field went wrong.' },
  { icon: 'shield', title: 'Secrets stay secret', text: 'Credentials are encrypted per workspace and never shown again once saved.' },
  { icon: 'bar-chart-2', title: 'Run history', text: 'Every run is logged with its inputs and outputs, searchable for a year.' },
]

export interface Testimonial {
  quote: string
  name: string
  role: string
}

export const testimonials: Testimonial[] = [
  { quote: 'We retired four scripts and a spreadsheet in the first week.', name: 'Priya Natarajan', role: 'Head of Operations, Northwind' },
  { quote: 'Approvals used to sit in someone’s inbox for days. Now they take minutes.', name: 'Marco Bellini', role: 'Finance Lead, Contoso' },
  { quote: 'The run history is the first thing I open when a customer says something broke.', name: 'Lena Fischer', role: 'Support Engineer, Fabrikam' },
  { quote: 'Our sales team set up their own lead routing without filing a single ticket.', name: 'Sam Okafor', role: 'RevOps Manager, Tailspin' },
  { quote: 'Retries with a reason attached saved our on-call rotation.', name: 'Aiko Tanaka', role: 'Platform Engineer, Litware' },
  { quote: 'It reads like a checklist, so the whole team understands what runs.', name: 'Diego Ramos', role: 'COO, Proseware' },
]

export interface Plan {
  id: string
  name: string
  description: string
  monthly: number
  yearly: number
  unit: string
  features: string[]
  highlighted?: boolean
}

export const plans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'For trying Wayline on a few hand-offs.',
    monthly: 0,
    yearly: 0,
    unit: 'free forever',
    features: ['3 workflows', '1,000 tasks a month', 'Email support'],
  },
  {
    id: 'team',
    name: 'Team',
    description: 'For teams automating their daily work.',
    monthly: 24,
    yearly: 19,
    unit: 'per user / month',
    features: ['Unlimited workflows', '50,000 tasks a month', 'Approvals on mobile', 'Run history for 90 days'],
    highlighted: true,
  },
  {
    id: 'business',
    name: 'Business',
    description: 'For companies with security and scale needs.',
    monthly: 49,
    yearly: 39,
    unit: 'per user / month',
    features: ['Everything in Team', 'Single sign-on', 'Audit log export', 'Run history for a year'],
  },
]

export const faqs = [
  {
    question: 'Do I need to write code?',
    answer: 'No. Workflows are built from steps you pick and rules you write in plain language. Developers can add a code step when they want one.',
  },
  {
    question: 'What counts as a task?',
    answer: 'Each step that runs counts as one task. Steps that are skipped by a condition, and retries, are free.',
  },
  {
    question: 'Can I change plans later?',
    answer: 'Yes, at any time. Upgrades apply straight away; downgrades apply at the end of the billing period.',
  },
  {
    question: 'Where is my data stored?',
    answer: 'In the region you choose when you create a workspace: the EU or the US. Run data never leaves it.',
  },
]
