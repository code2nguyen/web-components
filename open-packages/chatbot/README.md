# Chatbot

Minimal chat shell for application-provided conversation content.

```html
<c2-chatbot class="support-chat">
  <p>Hi! How can we help?</p>
</c2-chatbot>
```

The default slot projects consumer-owned conversation content into the always-present `messages` region. Style assigned messages with ordinary classes and the component-owned placement region with `c2-chatbot::part(messages)`.

```css
.support-chat::part(messages) {
  padding: 1rem;
  background: #eff6ff;
}
```
