---
id: account-settings
title: The account settings of a SaaS product
size: feature
focus: []
directions: [default, dense-admin]
---

## Purpose

The settings area of a B2B SaaS product, as in Linear, Notion or Stripe: a signed-in user edits their profile,
notification preferences and API key, and can delete their account. It exercises forms end to end: validation, a summary
of errors, a save that talks to a server and can fail, unsaved-change protection, conditional fields, a destructive
confirmation, and secrets.

## Screens

- **Settings shell:** a header with the user's avatar and name; three sections, Profile, Notifications and API, switched
  with tabs (on a phone, the tabs scroll sideways or become a select).
- **Profile:** full name (required), email (required, valid address), job title (optional), time zone (searchable
  select), language (English or Français), and a bio of at most 160 characters with a counter. "Save changes" and
  "Discard" at the bottom, both disabled until something changes.
- **Notifications:** a matrix of events × channels with a checkbox per cell. Events: Mentions, Comments on my issues,
  Status changes, Weekly digest. Channels: Email, Push, Slack. A "Do not disturb" switch reveals two time fields, From
  and To.
- **API:** the API key shown masked, with Reveal, Copy and Regenerate. Regenerating asks for confirmation first.
- **Danger zone** (under Profile): "Delete account" opens a confirmation where the user types their email to enable the
  final button.

## Data

The signed-in user: Ada Moreau, ada@example.com, "Staff engineer", time zone Europe/Paris, language English, bio empty.
API key `demo_key_7f3a9c2e5b1d8f4a6c0e2b9d`. Notification defaults: Mentions on Email and Push; Comments on
Email; Status changes on Slack; Weekly digest on Email. Do not disturb off; when turned on, 22:00 to 07:00.

The server is simulated in the page with a 600ms delay. Saving a profile whose email is `taken@example.com` fails with
the field error "This email is already used by another account". Every other save succeeds.

## Requirements

- R1 [form.validation] Name and email are required; email must be a valid address; the bio stops at 160 characters and
  shows its count. Errors appear once a field is left or on submit, not while the user is still typing.
- R2 [form.error-summary] Submitting with errors lists them at the top of the form; each entry moves focus to its field.
- R3 [form.async-submit] Saving shows progress on the button, then "Profile saved"; a server error appears on its field.
- R4 [form.dirty-guard] Save and Discard stay disabled until something changes. Switching tabs or leaving the page
  with unsaved changes asks first.
- R5 [form.conditional] Turning on "Do not disturb" reveals the From and To times; turning it off hides them.
- R6 [list.selection] The notification matrix sets each event × channel cell; a column header toggles a whole channel.
- R7 [form.secret] The API key is masked by default and can be revealed, copied (with a confirmation) and regenerated.
- R8 [overlay.confirm] Regenerating the key and deleting the account each ask for confirmation; deleting requires typing
  the email.
- R9 [feedback.toast] Saved changes and a copied key are confirmed briefly.
- R10 [nav.tabs, layout.responsive] Profile, Notifications and API are tabs that still work on a phone.
- R11 [i18n.translate] With the language set to Français, the components' own text (validation messages, counters,
  buttons they draw) is in French.
- R12 [theme.density] The dense-admin direction fits the whole profile form on a 1280×800 screen without scrolling.
- R13 [a11y.keyboard, a11y.screen-reader] Everything works with the keyboard; errors are announced and tied to their
  fields.

## Tasks

### T1 · Fix a profile with errors (R1, R2)

- When I clear the name, type "ada@" as the email and choose "Save changes"
- Then the summary lists "Full name" and "Email", and both fields show their error
- When I choose the "Email" entry in the summary
- Then focus moves to the email field

### T2 · Save, and fail on the server (R3, R9)

- When I change the email to taken@example.com and save
- Then the button shows progress, then the email field says "This email is already used by another account"
- When I change it to ada.moreau@example.com and save
- Then "Profile saved" is confirmed and Save is disabled again

### T3 · Leave with unsaved changes (R4)

- When I edit the job title and switch to the Notifications tab
- Then I am asked whether to discard my changes, and staying keeps my edit

### T4 · Quiet hours (R5, R6)

- When I turn on "Do not disturb"
- Then From 22:00 and To 07:00 appear
- When I turn off Push for Mentions
- Then only Email stays checked for Mentions

### T5 · Copy and regenerate the key (R7, R8, R9)

- When I reveal the key, it reads demo_key_7f3a9c2e5b1d8f4a6c0e2b9d; copying it confirms "Copied"
- When I choose Regenerate
- Then I am asked to confirm, and cancelling keeps the old key

### T6 · Delete the account (R8)

- When I choose "Delete account"
- Then the final button stays disabled until I type ada@example.com

### T7 · In French (R11)

- When I set the language to Français and clear the name
- Then the components' validation message and counter are in French

## Design directions

- **default:** the theme as shipped.
- **dense-admin:** an internal admin tool: 13px base text, 28px controls, 8px gaps, 4px radius, neutral grey surfaces.
  Set only through `--c2-theme--*` tokens and component variables.

## Builder rules

- Use `c2-*` components and `@c2n/theme` for every control and widget. Find them with the c2n MCP server
  (`search_components`, `get_component`, `get_examples`) and validate with `validate_markup`.
- Plain HTML only where no component fits, with a `<!-- dogfood-exempt: reason -->` comment. The requirement it serves
  is then `hand-rolled` in the build report.
- Never reach into a component's shadow root or override its internals. Needing to is a `workaround`.
