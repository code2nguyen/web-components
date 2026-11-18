// Sample data of lab/specs/scenarios/pricing-page.md, exactly as written.
export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    pitch: 'For small teams getting organised',
    monthly: 12,
    yearly: 10,
    billedYearly: 120,
    cta: 'Start free',
    features: ['Unlimited projects', '3 guests', '5 GB storage', 'Integrations', 'Email support'],
  },
  {
    id: 'team',
    name: 'Team',
    pitch: 'For teams that ship every week',
    monthly: 29,
    yearly: 24,
    billedYearly: 288,
    cta: 'Start free',
    popular: true,
    features: ['Everything in Starter', 'Unlimited guests', '100 GB storage', 'Automations', 'Priority support'],
  },
  {
    id: 'business',
    name: 'Business',
    pitch: 'For companies with many teams',
    monthly: 79,
    yearly: 65,
    billedYearly: 780,
    cta: 'Contact sales',
    features: ['Everything in Team', 'SSO and SCIM', 'Audit log', '1 TB storage', 'A named account manager'],
  },
]

// true = included, false = not included, a string = a value.
export const COMPARISON = [
  { id: 'projects', feature: 'Projects', starter: 'Unlimited', team: 'Unlimited', business: 'Unlimited' },
  { id: 'guests', feature: 'Guests', starter: '3', team: 'Unlimited', business: 'Unlimited' },
  { id: 'storage', feature: 'Storage', starter: '5 GB', team: '100 GB', business: '1 TB' },
  { id: 'automations', feature: 'Automations', starter: false, team: true, business: true },
  { id: 'sso', feature: 'SSO and SCIM', starter: false, team: false, business: true },
  { id: 'audit', feature: 'Audit log', starter: false, team: false, business: true },
  { id: 'sla', feature: 'Uptime SLA', starter: false, team: false, business: '99.9%' },
  { id: 'support', feature: 'Support', starter: 'Email', team: 'Priority', business: 'Named manager' },
]
