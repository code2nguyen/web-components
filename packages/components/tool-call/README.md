# Tool Call

`c2-tool-call` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/tool-call'
```

```html
<c2-tool-call
  name="search_web"
  description="Searched the web for lit ssr"
  state="success"
  duration="1240"
  input='{"query":"lit ssr"}'
  output="Found 3 results"
></c2-tool-call>
```

One step an AI agent took with a tool, as a collapsible card: the tool's name, what it did and its `state` (`pending`,
`running`, `success`, `error`, `cancelled`) in the header, and the `input` and `output` (text, or any value as JSON)
when opened. `error-text` replaces the output of a failed call, the `input`/`output` slots take richer content, and the
`actions` slot holds Approve/Deny under the header. Every look is a `--c2-tool-call__*` CSS variable.
