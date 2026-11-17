---
id: crm-contacts
title: The contacts of a small-business CRM
size: app
focus: []
directions: [default, harbor]
---

## Purpose

The contacts area of a CRM for a small sales team, as in HubSpot, Attio or Pipedrive. A salesperson finds a contact
in a list of 500 or with a command palette, reads and edits the contact's details in place, writes notes, follows the
activity, and deletes a contact with a chance to undo. It exercises an app shell with a sidebar and breadcrumbs, a
large list, fast navigation by keyboard, inline editing with validation, rich text and a timeline, in two brands.

## Screens

- **Shell:** a sidebar (Contacts, Companies, Deals, Reports, Settings) that becomes a drawer on a phone; a header with
  breadcrumbs and a search hint "⌘K".
- **Contacts list** (`/contacts`): search, a filter by tag (Customer, Lead, Partner, several at once) and a "VIP only"
  switch; a table of Name (with avatar), Company, Tag, Owner and Last contacted, sortable by name and last contacted;
  "New contact". The count reads "500 contacts".
- **Contact page** (`/contacts/CT-0033`): breadcrumbs "Contacts › Nadia Haddad"; a header with avatar, name, company and
  tag; a details panel (email, phone, company, owner, tag) whose values are edited in place; tabs Notes and Activity;
  Delete in a "More" menu.
- **Command palette** (⌘K or Ctrl+K anywhere): find a contact by name or company, or run a command (New contact, Go to
  Companies, Toggle dark mode).

## Data

500 contacts, generated. For `i` from 1 to 500:

- **Id:** `CT-` and `i` on four digits (CT-0001 … CT-0500).
- **Name:** first name item `i % 20` of Ada, Bruno, Chloé, Dmitri, Elena, Farid, Grace, Hugo, Ines, Jonas, Kaito,
  Lucía, Mateo, Nadia, Oskar, Paula, Quentin, Rosa, Samir, Tess; last name item `(i × 7) % 25` of Moreau, Silva,
  Novak, Okafor, Lindqvist, Rossi, Haddad, Tanaka, Kowalski, Dubois, Nguyen, Fischer, Costa, Ivanova, Bakker, Murphy,
  Schmidt, Laurent, Yilmaz, Andersen, Petrov, Garcia, Byrne, Sato, Weber.
- **Company:** item `i % 12` of Acme Corp, Birch & Co, Cobalt Labs, Dune Outfitters, Ember Studio, Fjord Foods, Granite
  Health, Harbor Logistics, Iris Media, Juno Bank, Kite Aero, Lumen Energy.
- **Tag:** item `i % 3` of Customer, Lead, Partner. **VIP** when `i` is a multiple of 17 (29 contacts).
- **Owner:** item `i % 3` of Mia Chen, Tom Becker, Sara Ali.
- **Email:** first and last name in lower case without accents, joined by a dot, at the company's name in lower case
  without spaces or symbols, `.example` (`nadia.haddad@junobank.example`).
- **Phone:** `+33 6 12 ` followed by `i` on six digits split in pairs (`+33 6 12 00 00 33`).
- **Last contacted:** `(i × 3) mod 90` days before now, Friday 20 March 2026.

Values the tasks rely on: CT-0001 is Bruno Tanaka (Birch & Co, Lead). Five contacts are called Nadia Haddad: CT-0033
and CT-0333 at Juno Bank, CT-0133 and CT-0433 at Birch & Co, CT-0233 at Fjord Foods. 20 names contain "Tanaka" (6
Customers, 7 Leads, 7 Partners). Sorted by name, CT-0100 Ada Moreau is first and CT-0499 Tess Yilmaz last.

**Notes and activity of CT-0033:** one note by Mia Chen, 3 days ago: "Interested in the **Business** plan for 40 seats.
Follow up after their board meeting." Activity, newest first: "Note added" (3 days ago), "Email sent: Pricing for 40
seats" (5 days ago), "Contact created" (30 days ago).

**The server** is simulated: saving a field takes 300ms; an email already used by another contact
(`bruno.tanaka@birchco.example`) is refused with "Another contact already uses this email".

## Requirements

- R1 [list.large] The list scrolls through all 500 contacts smoothly and sorts by name and last contacted.
- R2 [search.text] Search matches name, company and email, ignoring case and accents ("lucia" finds Lucía).
- R3 [filter.multi-value, filter.toggle] Tags filter several at once; "VIP only" narrows further; the count follows.
- R4 [nav.command-palette] ⌘K / Ctrl+K opens the palette anywhere; it finds contacts by name or company, shows the
  company to tell same-named contacts apart, and runs commands; Enter opens, Escape closes.
- R5 [nav.breadcrumb] The contact page shows "Contacts › <name>", and Contacts leads back to the list as it was left
  (search, filters, scroll position).
- R6 [table.inline-edit, form.validation] Each detail is edited in place: Enter or leaving saves, Escape cancels; an
  invalid email or phone, or a server refusal, keeps the field open with its error.
- R7 [input.phone] The phone is edited with its country and saved in international form.
- R8 [input.rich-text, collab.comments] Notes are written with bold, links and lists; a new note shows at the top with
  its author and time.
- R9 [collab.activity] The activity lists what happened, newest first, and gains an entry for each note and edit.
- R10 [overlay.confirm, feedback.undo] Delete asks first; after deleting, the list shows the contact gone and offers
  Undo for a few seconds.
- R11 [nav.sidebar, layout.responsive] The sidebar is a drawer on a phone; the table becomes a list of rows with name,
  company and tag.
- R12 [theme.brand] The **harbor** direction applies its brand to every component.
- R13 [a11y.keyboard, a11y.screen-reader] Everything works with the keyboard; the palette and inline editors announce
  what they do.

## Tasks

### T1 · Jump to a contact (R4, R5)

- When I press Ctrl+K and type "nadia haddad"
- Then five results show, each with its company
- When I pick the one at Juno Bank listed first and press Enter
- Then CT-0033's page opens with "Contacts › Nadia Haddad"

### T2 · Narrow the list (R2, R3)

- When I search "tanaka"
- Then "20 contacts" shows
- When I filter by Partner
- Then "7 contacts" shows

### T3 · Back to where I was (R5)

- Given the list searched for "tanaka" and filtered by Partner
- When I open a contact and choose Contacts in the breadcrumbs
- Then the list is still searched and filtered

### T4 · Edit in place (R6, R7, R9)

- When I edit Nadia Haddad's (CT-0033) email to "bruno.tanaka@birchco.example"
- Then the field stays open with "Another contact already uses this email"
- When I press Escape
- Then the old email is back
- When I change the phone to "+44 7700 900123" and press Enter
- Then it is saved in international form and the activity starts with the phone change

### T5 · Write a note (R8, R9)

- When I add a note "Sent the **security** questionnaire." on CT-0033
- Then it shows first, by me, just now, with "security" in bold, and the activity starts with "Note added"

### T6 · Delete and undo (R10)

- When I delete CT-0001 and confirm
- Then the list reads "499 contacts" and offers Undo
- When I choose Undo
- Then "500 contacts" and Bruno Tanaka is back

### T7 · Sort (R1)

- When I sort by name
- Then CT-0100 Ada Moreau is first; scrolled to the end, CT-0499 Tess Yilmaz is last

## Design directions

- **default:** the theme as shipped.
- **harbor:** a navy and coral brand for a maritime logistics company. Primary `#0b3a5b`, accent coral `#e4572e`,
  surface `#f6f8fa`, raised `#ffffff`, text `#0f1b26`, muted `#5b6b79`, border `#d6dee5`. Font `"IBM Plex Sans",
system-ui, sans-serif`. Radius 8px on cards, 6px on controls, 999px on tags. Compact density: 32px controls, 13px
  table text.

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules). Routing may be hash-based (`#/contacts/CT-0033`).
