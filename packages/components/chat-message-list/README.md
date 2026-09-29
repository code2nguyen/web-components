# `@c2n/chat-message-list`

A scrolling conversation log for chat rooms and chatbots. It follows new messages while the reader is at the bottom (including a reply that grows while it streams), keeps the reader's place once they scroll up, offers a jump-to-latest button with an unread count, and requests older history at the top without moving the view when it is prepended.

```bash
npm install @c2n/chat-message-list @c2n/chat-message @c2n/chat-input
```

```html
<script type="module">
  import '@c2n/chat-message-list'
  import '@c2n/chat-message'
  import '@c2n/chat-input'
</script>

<div style="display: flex; flex-direction: column; height: 480px">
  <c2-chat-message-list has-more style="flex: 1">
    <c2-chat-message><span slot="title">Nova</span>Hi! How can I help?</c2-chat-message>
  </c2-chat-message-list>
  <c2-chat-input aria-label="Message"></c2-chat-input>
</div>

<script type="module">
  const list = document.querySelector('c2-chat-message-list')
  document.querySelector('c2-chat-input').addEventListener('submit-message', (event) => {
    const message = document.createElement('c2-chat-message')
    message.setAttribute('align', 'right')
    message.textContent = event.detail
    list.append(message)
    list.scrollToBottom('smooth')
  })
  list.addEventListener('load-older', async () => {
    list.loading = true
    const older = await fetchOlderMessages() // your history request, returning elements
    list.prepend(...older)
    list.loading = false
    list.hasMore = older.length > 0
  })
</script>
```

The list is a focusable `role="log"` region with `aria-live="polite"`. Slots: default (messages), `start`, `loading`, `empty` and `jump-icon`. Events `load-older` and `at-bottom-change` do not bubble. See `custom-elements.json` for the complete API and theming surface.
