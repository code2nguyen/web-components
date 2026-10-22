<script setup lang="ts">
import { ref } from 'vue'
import type { Form, FormEventMap, FormValidator } from '@c2n/components/form'
import { STATUS_LABEL, STATUS_TONE, type Conversation } from '../data/conversations'

const props = defineProps<{ conversation: Conversation }>()
const emit = defineEmits<{ reply: [body: string]; resolve: []; archive: []; details: [] }>()

const draft = ref('')
const form = ref<Form>()

// `required` alone accepts a reply of spaces; the form runs this after the controls' own checks and shows the
// message on the field whose control has that `name`.
const validator: FormValidator = (values) => (String(values.reply ?? '').trim() ? {} : { reply: 'Write a reply before sending.' })

// `valid-submit` only fires once every check passed, so there is nothing to re-validate here.
function send(event: FormEventMap['valid-submit']) {
  emit('reply', String(event.detail.values.reply).trim())
  // Clearing the state clears the field: `v-model` keeps the two in step, so Vue's next patch writes the empty
  // string back onto the element. The form is marked pristine so the emptied field reads as untouched again.
  draft.value = ''
  form.value?.markPristine()
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
          <c2-avatar slot="avatar" auto-color :name="message.author" class="thread__nested-avatar" />
          <span slot="title">{{ message.author }}</span>
          <!-- The day and time in the reader's language and time zone; the exact instant is the inner <time>. -->
          <c2-format-date slot="header-time" :date="message.at" weekday="short" hour="numeric" minute="2-digit" />
          <!-- This node belongs to Vue's light DOM, so its scoped class works normally. The global
               `::part(content)` rule styles the component-owned region around it independently.
               Message bodies are markdown: `:value` lands as a property (the element is registered first),
               `breaks` keeps single newlines, and `image-policy="click"` keeps an image URL in a customer's
               message from loading until the agent asks for it. -->
          <c2-markdown slot="message" class="thread__message-copy" :value="message.body" breaks code="plain" image-policy="click" />
        </c2-chat-message>
      </li>
    </ol>

    <!-- `c2-form` wraps a native <form>: a submit runs validation, shows the error under the field and focuses it,
         then fires `valid-submit` instead of navigating. `c2-form-field` labels the textarea and draws the hint, the
         error and the character counter, which reads `maxlength` from the control. `:validator` is a function, so
         Vue sets it as a property: the element is registered before the app mounts. -->
    <c2-form ref="form" class="thread__composer" necessity="none" :validator="validator" @valid-submit="send">
      <form>
        <c2-form-field label="Reply" hint="⌘ + Enter to send" counter>
          <!-- `v-model` works here, and for a reason worth knowing: on a custom element Vue compiles it to the
               plain-text model directive, which sets `el.value` and listens for `input`. These components expose a
               `value` property and re-emit the inner control's native `input` event through `redispatchEvent`, so
               they satisfy that contract without a wrapper. An element that only emitted a custom event would need
               `:value` plus an explicit listener instead. -->
          <c2-textarea v-model="draft" name="reply" :rows="3" :maxlength="2000" required placeholder="Write a reply…" @keydown.enter.meta="form?.submit()" />
        </c2-form-field>
        <div class="thread__composer-foot">
          <c2-button type="submit">Send reply</c2-button>
        </div>
      </form>
    </c2-form>
  </section>
</template>

<style scoped>
/* Assigned content remains in Vue's light DOM, so ordinary scoped selectors apply to it. */
.thread__message-copy {
  letter-spacing: 0.005em;
}
</style>
