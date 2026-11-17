---
id: support-inbox
title: A help-desk inbox for a support team
size: app
focus: []
directions: [default]
---

## Purpose

The shared inbox of a customer support team, as in Front, Help Scout or Zendesk. An agent finds a conversation, reads
the thread, replies, and resolves or archives it. It exercises a dense real-world screen: a selectable list with search
and filters, a chat thread, a validated composer, a drawer, and toasts with undo.

The first build of this spec is the hand-written Vue example `apps/examples/support-inbox-vue`, which the lab target
`lab/targets/support-inbox-vue.json` tests. Rebuilds from this spec go to `lab/apps/support-inbox/<direction>/`.

## Screens

- **Header:** the title "Inbox", a line "<shown> of <total> conversations · <unread> unread", a search box and a status
  filter (All conversations, Open, Waiting on customer, Closed).
- **Conversation list** (left): one row per conversation with the customer's avatar and a status dot, the customer
  name, the time of the last message ("30m ago"), the subject, and an unread count. One row is always selected.
- **Thread** (right): the subject, the customer, plan and status; actions Customer details, Archive and Resolve; the
  messages, the customer's on the left and the agent's on the right, each with author and time; a reply composer.
- **Customer drawer:** name, email, plan, status and number of messages.
- **Phone:** list and thread stack; the thread actions stay reachable.

## Data

Six conversations, newest first. The messages are in `apps/examples/support-inbox-vue/src/data/conversations.ts`
(copy them; their times are relative to page load).

| Id     | Customer        | Email                      | Plan       | Subject                                       | Status  | Unread | Messages |
| ------ | --------------- | -------------------------- | ---------- | --------------------------------------------- | ------- | ------ | -------- |
| C-4821 | Mireille Dufort | mireille@northwind.example | Enterprise | SSO login loops back to the sign-in page      | open    | 2      | 3        |
| C-4817 | Tobias Renner   | tobias@lattice.example     | Team       | Invoice 2291 charged twice                    | waiting | 0      | 2        |
| C-4809 | Aiko Tanaka     | aiko@meridian.example      | Enterprise | Export API returns 429 under load             | open    | 1      | 3        |
| C-4802 | Paulo Marques   | paulo@brava.example        | Free       | How do I move a project to another workspace? | closed  | 0      | 3        |
| C-4795 | Hanna Bergström | hanna@vinterlys.example    | Team       | Webhook signatures fail after key rotation    | waiting | 0      | 2        |
| C-4788 | Dmitri Volkov   | dmitri@sable.example       | Enterprise | Request: audit log retention beyond 90 days   | open    | 3      | 3        |

## Requirements

- R1 [search.text, search.highlight] Search matches the customer name or subject, ignoring case and accents
  ("bergstrom" finds Bergström), and marks the match.
- R2 [filter.multi-value] The status filter shows all conversations or only one status.
- R3 [list.selection] Choosing a row opens its thread and clears its unread count; one row is always selected.
- R4 [list.empty-state] When nothing matches, the list says so.
- R5 [i18n.format] Message times and "30m ago" are in the reader's language and keep themselves current.
- R6 [form.validation] The reply is required and may not be only spaces; the composer shows the error and keeps focus.
- R7 [feedback.toast] Sending a reply, resolving and archiving are confirmed by a toast.
- R8 [feedback.undo] Archiving can be undone from its toast; the conversation returns to its place.
- R9 [overlay.drawer] Customer details open in a drawer that closes with Escape and returns focus to its button.
- R10 [a11y.keyboard, a11y.screen-reader] The list, filter, thread actions and composer work with the keyboard; rows are
  read with the customer, status and subject, and nothing else.
- R11 [layout.responsive] On a phone, list and thread stack and every action stays usable.
- R12 [theme.dark] The dark theme reads well, the agent's own messages included.

## Tasks

### T1 · Find a customer (R1)

- When I type "bergstrom" in the search
- Then only Hanna Bergström's conversation is listed and the header says "1 of 6 conversations"

### T2 · Show closed conversations (R2)

- When I choose "Closed" in the status filter
- Then only Paulo Marques's conversation is listed

### T3 · Open a conversation (R3)

- When I choose Aiko Tanaka's conversation
- Then its thread opens and the header says "5 unread"

### T4 · Reply (R6, R7)

- When I write "We have reset your session, please try again." and send it
- Then it appears at the end of the thread, "Reply sent." is confirmed, and the composer is empty
- When I try to send a reply made of spaces
- Then "Write a reply before sending." is shown and focus stays in the composer

### T5 · Customer details (R9)

- When I open Customer details
- Then the drawer shows the plan "Enterprise"
- When I press Escape
- Then the drawer closes and focus is back on Customer details

### T6 · Archive and undo (R7, R8)

- When I archive the open conversation
- Then the header says "5 of 5 conversations" and the toast offers Undo
- When I choose Undo
- Then all 6 conversations are back and the conversation is open again

### T7 · Resolve (R7)

- When I resolve the open conversation
- Then "Conversation closed." is confirmed and its status reads Closed

## Builder rules

- Use `c2-*` components and `@c2n/theme` for every control and widget. Find them with the c2n MCP server
  (`search_components`, `get_component`, `get_examples`) and validate with `validate_markup`.
- Plain HTML only where no component fits, with a `<!-- dogfood-exempt: reason -->` comment. The requirement it serves
  is then `hand-rolled` in the build report.
- Never reach into a component's shadow root or override its internals. Needing to is a `workaround`.
- Any framework, or none.
