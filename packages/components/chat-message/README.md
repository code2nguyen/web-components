# `@c2n/chat-message`

A flexible Lit message row for assistant answers, conversations and activity updates.

```html
<script type="module">
  import '@c2n/chat-message'
</script>

<c2-chat-message>
  <span slot="title">Assistant</span>
  <time slot="header-time">Now</time>
  <p>Your answer can contain any semantic HTML.</p>
</c2-chat-message>
```

Use `align="right"` for outgoing messages. Optional avatar, header, reaction and footer-time slots collapse when empty. See `custom-elements.json` for the complete slot, part and CSS custom-property API.
