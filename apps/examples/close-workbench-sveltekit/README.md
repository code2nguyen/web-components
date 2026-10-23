# Month-End Close Workbench

A bank reconciliation for a month-end close, built with SvelteKit 3 and Svelte 5 and nothing but c2n web components for its UI.

Closing the books means proving that the cash in the general ledger is the cash in the bank. The workbench reads the bank statement and the ledger's cash postings for the month, pairs what it can, and then works the rest into one of two outcomes. A line either needs an adjusting entry, or it is a timing difference that reconciles on its own. The month is only signed off once adjusted bank and adjusted book agree to the cent.

The sample is September 2026 for Fernhill Coffee Roasters, a fictional wholesale roaster (`src/lib/close/sample.ts`, deterministic). A seeded generator writes about 40 routine receipts, payments, cleared checks and card settlements. Hidden among them are ten classic problems:

| Planted case                                                 | What the workbench finds                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| A wire to the coffee importer, with its fee on its own line  | The wire matches on its payment reference; the $15 fee is not in the books   |
| Monthly service charge, interest paid                        | Not in the books                                                             |
| A customer's deposit comes back NSF, with a $35 return fee   | The deposit matches; the return and the fee are not in the books             |
| One ACH remittance for three invoices                        | A split match, one bank line to three receipts                               |
| A customer short-pays an invoice by $125                     | An amount mismatch, read as an early-payment discount                        |
| Check 10244 cleared at $1,352, booked at $1,532              | An amount mismatch divisible by 9: transposed digits                         |
| A vendor payment posted twice                                | One posting matches, the other is a duplicate to reverse                     |
| A debit-card purchase nobody expensed                        | Not in the books                                                             |
| Two checks written and a card deposit booked on Sep 28–30    | Outstanding checks and a deposit in transit: timing, no entry                |
| A mobile deposit made nine days after the receipt was booked | Unmatched at the default 3-day window: widen the window, or match it by hand |

## Four screens

| Route         | What you do there                                                                                                                                                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`           | The close at a glance: the reconciliation as an accountant writes it (statement + deposits in transit − outstanding checks vs. books + adjustments), the sign-off checklist, the five-day close calendar with the operating account's tasks live, the status of every balance-sheet account through the close, and daily bank vs. book balances.                                 |
| `/reconcile`  | The matcher. Bank statement and ledger side by side, filtered with a `key:value` query (`status:unmatched amount:>1000 -channel:card harbor`). Select lines on both sides to match them by hand once their totals agree; widen the date window to let the engine try again; undo a match the engine got wrong.                                                                   |
| `/exceptions` | Everything left over, on a board: Unreviewed → Investigating → Needs adjustment → Resolved. Each card says what probably happened and how far it moves cash. The board enforces the books: a card that changes cash cannot be resolved without an entry, and a timing difference cannot be given one. Details shows the lines involved, the proposed entry, an owner and a note. |
| `/journal`    | The adjusting entries proposed from the Needs adjustment column, in an editable spreadsheet with formula totals. Accounts, memos and amounts can all be changed; the draft is checked (known accounts, one side per line, balanced), and the trial balance is shown before and after posting as a diff. Posting resolves the cards it covered.                                   |

Decisions (manual matches, undone matches, the board, notes, the journal draft, what was posted, the sign-off) are kept in `localStorage`, so a reload keeps the work.

## How it matches

`src/lib/close/` is plain, DOM-free TypeScript with unit tests (`test/unit`). The rules run from most to least certain, and each one sees only what the rules before it left:

1. **Reference.** The same normalised reference (invoice, payment or check number; `CHK-10244` and `10244` are one) and the same amount.
2. **Amount and date.** The same amount within the date window, and only when there is a single candidate on each side. An ambiguous amount is left for a person rather than guessed.
3. **Split.** One bank line that equals two to four ledger entries of the same counterparty within the window.

When both sides share a reference but not an amount, the pair is not matched. It is reported as a discrepancy, and the exception classifier turns it into an amount mismatch, flagging transposed digits when the difference is divisible by 9.

## c2n usage

| Region     | Components                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell      | `c2-header`, `c2-navigation-menu` (its links route client-side), `c2-badge`, `c2-theme-select`, `c2-toast-region`                                  |
| Overview   | `c2-stat`, `c2-card`, `c2-description-list`, `c2-steps` (data-driven), `c2-popconfirm`, `c2-gantt`, `c2-state-timeline`, `c2-line-chart`           |
| Reconcile  | `c2-query-input`, `c2-number-input`, `c2-tabs`, `c2-split-panel`, `c2-table` (multiple selection, `rowPart`), `c2-comparison-bar`, `c2-popconfirm` |
| Exceptions | `c2-kanban` (keyboard and pointer moves, `renderItem`, cancelable `card-move`), `c2-sheet`, `c2-select`, `c2-inline-edit`                          |
| Journal    | `c2-spreadsheet` (formula bar, totals, `cell-change`), `c2-diff-viewer`, `c2-banner`, `c2-status-panel`, `c2-table` (summary row)                  |

## SvelteKit notes

Every route is prerendered by `@sveltejs/adapter-static`, so the HTML the server writes and the page the browser hydrates have to agree. Five things make that work:

- **Register before hydration.** `src/hooks.client.ts` exports `init`, which SvelteKit awaits before hydrating, and imports `src/lib/c2n.ts` from it. Svelte picks between a property and an attribute with `key in element`, so the elements have to be defined by the time the first binding runs; `init` makes that ordering a guarantee. The server never imports the components.
- **Arrays and objects: `data()`.** On the server Svelte can only write attributes, and `rows={rows}` prerenders as `rows="[object Object]"`. `data(value)` from `src/lib/ssr.ts` returns JSON on the server (which the component's attribute converter parses) and the value itself in the browser (which Svelte assigns as a property).
- **Functions: `{@attach}`.** A function prop is never an attribute: the server would stringify its source into the HTML. `renderItem` on the board and `rowPart` on the tables are set from attachments, which run only in the browser.
- **Numbers in braces.** For an attribute that is also a property (`precision`, `position`, `min`), Svelte assigns the property, and a static `precision="0"` is the string `"0"`, which a `Number` property does not convert. Write `precision={0}`.
- **Events.** Svelte 5 event attributes listen for the name as written, so `onselection-change`, `oncard-move` and `oncell-change` bind kebab-case custom events directly; type the handler with the component's event map (`TableEventMap['selection-change']`).

Two smaller things:

- Svelte's a11y checks cannot tell that `<c2-button onclick>` is a real button inside its shadow root. `vite.config.ts` filters those two warnings for `c2-*` tags only.
- SvelteKit 3 reads its configuration from the `sveltekit()` Vite plugin (there is no `svelte.config.js`), and `#lib` subpath imports in `package.json` replace `$lib`.

The palette lives in `src/app.css` as `--cw-*` tokens, bridged onto `--c2-theme--*`. Components are styled only through their documented `--c2-*` variables and parts; `npm run check:css-contracts` and `c2n-mcp validate` check them.

## Commands

```bash
npm run dev -w apps/examples/close-workbench-sveltekit
npm run build -w apps/examples/close-workbench-sveltekit         # svelte-check, then prerender into dist/
npm run test:unit -w apps/examples/close-workbench-sveltekit     # matching, exceptions, journal, reconciliation, filter
npm run test:browser -w apps/examples/close-workbench-sveltekit  # Playwright against the built app (vite preview)
```
