<script setup lang="ts">
import { ref } from 'vue'
import { STATUS_LABEL, STATUS_TONE, type Conversation } from '../data/conversations'

const props = defineProps<{ conversation: Conversation }>()
const emit = defineEmits<{ reply: [body: string]; resolve: []; archive: []; details: [] }>()

const draft = ref('')

function send() {
  const body = draft.value.trim()
  if (!body) return
  emit('reply', body)
  // Clearing the state clears the field: `v-model` keeps the two in step, so Vue's next patch writes the empty
  // string back onto the element.
  draft.value = ''
}
</script>

<template>
  <section class="thread">
    <header class="thread__head">
      <c2-avatar auto-color :name="props.conversation.customer" class="thread__avatar" />
      <div class="thread__ident">
        <h2>{{ props.conversation.subject }}</h2>
        <p>
          {{ props.conversation.customer }} · {{ props.conversation.plan }}
          <c2-badge :tone="STATUS_TONE[props.conversation.status]">{{ STATUS_LABEL[props.conversation.status] }}</c2-badge>
        </p>
      </div>

      <div class="thread__actions">
        <!-- A tooltip placed inside the element it describes takes that element as its target: no id, no
             wiring. It renders in the top layer, so it is never clipped by the panel. -->
        <c2-icon-button aria-label="Customer details" @click="emit('details')">
          <c2-feather-user />
          <c2-tooltip>Customer details</c2-tooltip>
        </c2-icon-button>
        <c2-icon-button aria-label="Archive conversation" @click="emit('archive')">
          <c2-feather-archive />
          <c2-tooltip>Archive</c2-tooltip>
        </c2-icon-button>
        <!-- `disabled` is a boolean: Vue writes the property, and the element reflects it back to the
             attribute itself. Binding `false` therefore removes it rather than leaving `disabled="false"`. -->
        <c2-button :disabled="props.conversation.status === 'closed'" @click="emit('resolve')">
          <c2-feather-check slot="prefix-icon" />
          Resolve
        </c2-button>
      </div>
    </header>

    <ol class="thread__messages">
      <li v-for="message in props.conversation.messages" :key="message.id">
        <!-- `.attr` is the counterpart of `.prop`, and this is the one binding here that needs it. Vue's
             `key in el` rule would pick the `align` property, but the component does not reflect that property
             and styles the flipped layout with `:host([align='right'])` — so the property alone would be
             silently inert. Forcing the attribute is what the selector actually reads. -->
        <c2-chat-message :align.attr="message.from === 'agent' ? 'right' : 'left'" :class="`thread__message thread__message--${message.from}`">
          <c2-avatar slot="avatar" auto-color :name="message.author" />
          <span slot="title">{{ message.author }}</span>
          <span slot="header-time">{{ message.at }}</span>
          <p slot="message">{{ message.body }}</p>
        </c2-chat-message>
      </li>
    </ol>

    <footer class="thread__composer">
      <!-- `v-model` works here, and for a reason worth knowing: on a custom element Vue compiles it to the
           plain-text model directive, which sets `el.value` and listens for `input`. These components expose a
           `value` property and re-emit the inner control's native `input` event through `redispatchEvent`, so
           they satisfy that contract without a wrapper. An element that only emitted a custom event would need
           `:value` plus an explicit listener instead. -->
      <c2-textarea v-model="draft" :rows="3" aria-label="Write a reply" placeholder="Write a reply…" @keydown.enter.meta="send" />
      <div class="thread__composer-foot">
        <span class="thread__hint">⌘ + Enter to send</span>
        <c2-button :disabled="!draft.trim()" @click="send">Send reply</c2-button>
      </div>
    </footer>
  </section>
</template>
