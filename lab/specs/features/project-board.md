---
id: project-board
title: A team's kanban board with card details
size: feature
focus: []
directions: [default]
---

## Purpose

The board view of a project tracker, as in Linear, Jira or Trello. A team moves cards between columns, keeps work in
progress under a limit, opens a card to read and edit it, and discusses it in comments. It exercises a board with
drag and keyboard moves, a limit that warns, undo, a side drawer with rich text, a date, an assignee and comments.

## Screens

- **Toolbar:** the board name "Mobile app · Sprint 14", a filter by assignee (several at once), and "New card".
- **Board:** four columns, Backlog, In progress, Review, Done, each with its card count; In progress shows its limit
  ("2 / 3"). Each card shows its id, title, assignee avatar, due date and comment count.
- **Card drawer:** opens on the right when a card is opened: title (editable), status, assignee, due date, a rich-text
  description, the activity (moves and edits, newest first) and comments with a box to add one.
- **Phone:** one column at a time, switched with tabs that show each column's count; moving a card is done from its
  drawer's status field.

## Data

**People:** Lena Ortiz, Omar Haddad, Priya Nair. "You" are Priya.

**Now** is Wednesday 11 March 2026.

| Id    | Title                               | Column      | Assignee | Due         | Comments |
| ----- | ----------------------------------- | ----------- | -------- | ----------- | -------- |
| MA-41 | Offline mode for saved articles     | Backlog     | Lena     | 20 Mar 2026 | 0        |
| MA-42 | Dark mode for the reader            | Backlog     | Omar     | 24 Mar 2026 | 2        |
| MA-43 | Crash on Android 12 when rotating   | Backlog     | Priya    | 13 Mar 2026 | 1        |
| MA-44 | Onboarding: skip button             | In progress | Lena     | 12 Mar 2026 | 0        |
| MA-45 | Push notification preferences       | In progress | Omar     | 18 Mar 2026 | 3        |
| MA-46 | Search suggestions                  | Review      | Priya    | 10 Mar 2026 | 1        |
| MA-47 | Replace image loader                | Review      | Lena     | 16 Mar 2026 | 0        |
| MA-48 | Login with Apple                    | Done        | Omar     | 6 Mar 2026  | 4        |
| MA-49 | Fix pull-to-refresh jitter          | Done        | Priya    | 9 Mar 2026  | 0        |
| MA-50 | Accessibility labels on the tab bar | Done        | Lena     | 5 Mar 2026  | 2        |

Counts: Backlog 3, In progress 2 (limit 3), Review 2, Done 3. MA-46 is overdue (due 10 March, not done). MA-43's
description is "Steps: open an article, rotate the phone. **Expected:** the article keeps its position." (with bold).
Its comment: Omar, "Reproduced on a Pixel 6.", 2 days ago.

## Requirements

- R1 [planning.board] Cards sit in their columns with counts; the In progress limit shows and moving a fourth card in
  is allowed but marks the column as over its limit.
- R2 [list.reorder] A card moves between and within columns by dragging, and by keyboard (pick up, arrow to the new
  place, drop), with the move announced.
- R3 [feedback.undo] A move can be undone from the confirmation that follows it.
- R4 [filter.multi-value] The assignee filter shows the cards of the people picked; the counts follow.
- R5 [overlay.drawer] Opening a card opens its drawer; Escape closes it and returns focus to the card.
- R6 [input.rich-text] The description is edited with bold, links and lists, and saved when the field is left.
- R7 [input.date] The due date is picked from a calendar; a past due date on an open card reads as overdue on the
  board.
- R8 [collab.comments] Comments show author, time and text; adding one shows it at once with the count on the card
  updated.
- R9 [collab.activity] Moves and edits appear in the card's activity, newest first.
- R10 [layout.responsive, nav.tabs] On a phone the columns are tabs with their counts.
- R11 [a11y.keyboard, a11y.screen-reader] The board is usable with the keyboard alone; each card is read with its id,
  title, assignee and due date.

## Tasks

### T1 · Move a card and undo (R2, R3, R9)

- When I move MA-43 from Backlog to In progress
- Then Backlog reads 2, In progress reads 3 / 3, and the move is announced
- When I choose Undo
- Then MA-43 is back in Backlog

### T2 · Over the limit (R1)

- When I move MA-43 and then MA-41 to In progress
- Then In progress reads 4 / 3 and is marked over its limit

### T3 · Move with the keyboard (R2, R11)

- When I focus MA-47, pick it up with Space, press the right arrow and drop it with Space
- Then MA-47 is in Done and Review reads 1

### T4 · Filter by person (R4)

- When I filter by Lena and Omar
- Then 7 cards show: Backlog 2, In progress 2, Review 1, Done 2

### T5 · Edit a card (R5, R6, R7, R9)

- When I open MA-43, make "Expected:" plain text, link "rotate the phone" to https://example.com/issues/43, and set
  the due date to 17 March
- Then the board shows MA-43 due 17 March, and its activity lists the edits newest first
- When I press Escape
- Then the drawer closes and focus is on MA-43

### T6 · Comment (R8)

- When I open MA-43 and comment "On it, looks like a lifecycle bug."
- Then the comment shows under Omar's, from Priya, just now, and MA-43 shows 2 comments

### T7 · Overdue (R7)

- Then MA-46 reads as overdue and MA-48, done, does not

## Builder rules

The rules in [`../README.md`](../README.md#builder-rules).
