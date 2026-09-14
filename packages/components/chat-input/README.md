# `@c2n/chat-input`

An auto-growing Lit message composer with keyboard submission, a built-in send button, slotted toolbar actions and native form participation.

```bash
npm install @c2n/chat-input
```

```html
<script type="module">
  import '@c2n/chat-input'
</script>

<c2-chat-input aria-label="Message" placeholder="Ask anything…"></c2-chat-input>

<script>
  document.querySelector('c2-chat-input').addEventListener('submit-message', (event) => {
    console.log(event.detail)
  })
</script>
```

Enter submits, while Shift+Enter and Alt+Enter insert a newline. The `toolbar` and `send-icon` slots customize the action row. See `custom-elements.json` for the complete API and theming surface.
