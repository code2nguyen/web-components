# Terminal

`c2-terminal` ships in the single `@c2n/components` package.

```bash
npm install @c2n/components
```

```js
import '@c2n/components/terminal'
```

```html
<c2-terminal heading="acme-cli"><span slot="banner">Type help for commands.</span></c2-terminal>
```

An interactive prompt for commands your app answers: dev consoles, CLI tutorials, chat-ops, admin shells. Not a terminal emulator (no PTY); use xterm.js for that.

- `handler(command, { name, args, print, signal })` returns a string, a node, a promise of either, or an async iterable of lines, which streams. Without one, listen to `command` and call `print(text, { kind })`.
- Built-ins: `clear` (Ctrl+L), `help` (lists `commands`), Ctrl+C aborts `signal` and frees the prompt at once. Tab completes through `complete(input)`; Up and Down walk `history`.
- Strings are drawn as text, never HTML; ANSI colour and bold codes are shown, other escapes dropped; a leading `\r` rewrites the last line (progress output). `max-lines` (5,000) bounds the screen.
- `prompt`, `label`, `heading`, the `banner` and `prompt` slots; dark in both themes, every colour a `--c2-terminal*` custom property. See the API page of the docs site.
