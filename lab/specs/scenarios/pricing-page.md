---
id: pricing-page
title: The pricing page of a SaaS product, in a strong brand
size: scenario
focus: []
directions: [default, juniper, juniper-dark]
---

## Purpose

The public pricing page of a project-management SaaS, as on Linear, Notion or Basecamp. A visitor compares three plans,
switches between monthly and yearly billing, reads the feature comparison and the FAQ. The page is simple; the test is
the look: can a strong brand, light and dark, be applied to the components through tokens, variables and parts alone?

## Screens

One page, top to bottom.

- **Hero:** "Simple pricing for growing teams" and a one-line subtitle.
- **Billing switch:** Monthly / Yearly, with "Save 20%" next to Yearly.
- **Plans:** three cards side by side (stacked on a phone): name, one-line pitch, price per month, billing note, five
  features with check marks, and a call to action. Team is marked "Most popular" and stands out.
- **Comparison:** a table of 8 features × 3 plans, check marks or values, the header row staying visible while the
  table scrolls on a phone.
- **FAQ:** 5 questions that open and close; one open at a time is fine but not required.
- **Footer CTA:** "Still deciding? Talk to sales" with a button.

## Data

| Plan     | Pitch                             | Monthly | Yearly (per month) | Billed yearly | Call to action |
| -------- | --------------------------------- | ------- | ------------------ | ------------- | -------------- |
| Starter  | For small teams getting organised | $12     | $10                | $120          | Start free     |
| Team     | For teams that ship every week    | $29     | $24                | $288          | Start free     |
| Business | For companies with many teams     | $79     | $65                | $780          | Contact sales  |

The billing note reads "per user / month" for monthly and "per user / month, billed $120 yearly" (with each plan's
amount) for yearly. Monthly is the default.

Plan features (card list): Starter: Unlimited projects, 3 guests, 5 GB storage, Integrations, Email support. Team:
everything in Starter, Unlimited guests, 100 GB storage, Automations, Priority support. Business: everything in Team,
SSO and SCIM, Audit log, 1 TB storage, A named account manager.

Comparison rows: Projects (Unlimited ×3) · Guests (3 / Unlimited / Unlimited) · Storage (5 GB / 100 GB / 1 TB) ·
Automations (– / ✓ / ✓) · SSO and SCIM (– / – / ✓) · Audit log (– / – / ✓) · Uptime SLA (– / – / 99.9%) · Support
(Email / Priority / Named manager).

FAQ: "Can I change plans later?" · "What counts as a user?" · "Do you offer discounts for non-profits?" · "How does
the free trial work?" · "Where is my data stored?", each with a two-sentence answer of the builder's choosing.

## Requirements

- R1 [input.choice] Monthly and Yearly are two options shown at once; switching updates every price and billing note.
- R2 [i18n.format] Prices are currency in the reader's locale.
- R3 [layout.disclosure] Each FAQ question opens and closes its answer; closed answers are still found by the
  browser's find-in-page.
- R4 [layout.responsive] On a phone the cards stack, Team first, and the comparison table scrolls sideways in its frame
  with the feature column kept visible.
- R5 [theme.brand] The **juniper** direction applies the brand below to every component on the page.
- R6 [theme.dark] The **juniper-dark** direction applies the dark version, and every text still reads (AA contrast).
- R7 [a11y.screen-reader] Check marks and dashes in the comparison are read as "Included" and "Not included".

## Tasks

### T1 · Switch to yearly (R1, R2)

- When I choose Yearly
- Then Team reads $24 and "per user / month, billed $288 yearly"
- When I choose Monthly
- Then Team reads $29 and "per user / month"

### T2 · Read an answer (R3)

- When I open "Where is my data stored?"
- Then its answer shows
- When I search the page for a word that only appears in a closed answer
- Then that answer opens

### T3 · On a phone (R4)

- Given a phone-sized screen
- Then the first card is Team, and the comparison table scrolls sideways without the page scrolling

### T4 · The brand holds (R5, R6)

- Given the juniper or juniper-dark direction
- Then every button, card, switch and disclosure on the page uses the brand's colours, type and radius, and no
  default theme colour is left

## Design directions

- **default:** the theme as shipped.
- **juniper:** a calm, editorial brand. Primary deep green `#14532d` (hover `#166534`), accent amber `#b45309`,
  surface cream `#fdf8ef`, raised surfaces `#ffffff`, text `#1c1917`, muted text `#57534e`, borders `#e7e0d2`. Headings
  in a serif (`"Fraunces", Georgia, serif`), body in `"Inter", system-ui, sans-serif`. Radius 2px on controls, 4px on
  cards. Buttons are pill-free and uppercase-free; the "Most popular" card has a 2px green border.
- **juniper-dark:** the same brand at night: surface `#14120f`, raised `#1d1a16`, text `#f5efe4`, muted `#a8a29e`,
  primary `#4ade80` with dark text on it, accent `#f59e0b`, borders `#2e2a24`.

Each direction is its own build. Set the brand once through `--c2-theme--*` tokens, then component variables where a
token does not reach; record in the build report every place where neither did.

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules). Fonts may be loaded from Google Fonts.
