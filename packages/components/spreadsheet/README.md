# Spreadsheet

`c2-spreadsheet` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/spreadsheet'
```

```html
<c2-spreadsheet
  label="Quote"
  formula-bar
  summary
  columns='[{"label":"Item"},{"label":"Qty","format":"number"},{"label":"Price","format":"currency"},{"label":"Total","format":"currency"}]'
  data='[["Design",8,120,"=B1*C1"],["Build",24,95,"=B2*C2"],["Total","","","=SUM(D1:D2)"]]'
></c2-spreadsheet>
```

A small editable grid with basic formulas: one sheet, about twenty functions (`SUM`, `AVERAGE`, `IF`, `SUMIF`, …),
keyboard editing like Sheets and Excel, copy and paste as tab-separated text, undo and redo. `data` holds the raw
inputs row by row; edits write a new array to it and fire `cell-change`. Extra functions go in the `functions`
property. All presentation is `--c2-spreadsheet*` CSS variables; see the API page of the docs site for the full list.
