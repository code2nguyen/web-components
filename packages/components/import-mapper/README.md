# Import Mapper

`c2-import-mapper` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/import-mapper'
```

```html
<c2-import-mapper
  label="Import contacts"
  fields='[{"key":"name","label":"Name","required":true},{"key":"email","label":"Email","required":true,"type":"email"}]'
  csv="Full name,E-mail address
Ada Lovelace,ada@example.com"
></c2-import-mapper>
```

The mapping step of a CSV or spreadsheet import. Each column of the file gets a field picker, pre-filled by matching its
header to the fields' `key`, `label` and `aliases`; a summary lists the required fields and whether each is mapped.
`view="preview"` shows the rows as they will be imported, with each invalid cell marked (`required`, `type`, `options`,
`pattern`, or a `validate` function).

- **File:** `csv` text, `columns` + `rows` (arrays or records), or `columns` + a `dataSource` (`getRows({ start, count })`).
- **Output:** `mapping` (one field key or `null` per column), `missing`, `validate()`, `records()`, and the `mapping-change` event.
- **Actions:** none built in besides the preview pager; put your own buttons in the `toolbar` or `footer` slot.
- **Extension:** `renderSamples`, `renderCell`, `matcher`; text through the `import-mapper` message catalog.
- **Styling:** `--c2-import-mapper--*` variables and the `summary`, `column`, `picker`, `table`, `pager` parts.

The helpers `parseCsv`, `autoMatch`, `matchScore` and `checkValue` are exported for use without the element.
