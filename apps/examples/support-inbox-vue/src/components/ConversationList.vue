<script setup lang="ts">
import { STATUS_TONE, type Conversation } from '../data/conversations'

defineProps<{ conversations: Conversation[]; activeId: string }>()
const emit = defineEmits<{ select: [id: string] }>()

/**
 * `selection-change` is a kebab-case CustomEvent. Vue registers every `@…` binding on an element with
 * `addEventListener` under the name as written, so it binds by its real name and the event arrives untouched —
 * no synthetic event system in the way and no `on*` spelling to invent, which is the main thing React has to
 * work around.
 *
 * Typing it is on us: an unknown element hands the listener a plain `Event`, so the detail is narrowed here
 * rather than inside the template.
 */
function handleSelection(event: Event) {
  const { value } = (event as CustomEvent<{ value: string[] }>).detail
  if (value[0]) emit('select', value[0])
}
</script>

<template>
  <!-- `value` is a `string[]`. `.prop` writes it as a DOM property, skipping the attribute serialisation an
       array would otherwise go through. Vue would in fact pick the property on its own — for a custom element
       it decides with `key in el`, which holds once the class is registered — but `.prop` says so in the markup
       instead of relying on the element having upgraded first.

       `required` keeps one row selected: clicking the open conversation does not close it. -->
  <c2-list class="inbox__list" required :value.prop="[activeId]" aria-label="Conversations" @selection-change="handleSelection">
    <c2-list-item v-for="conversation in conversations" :key="conversation.id" :value="conversation.id">
      <c2-avatar slot="prefix-icon" auto-color :name="conversation.customer" />
      <span class="inbox__row">
        <span class="inbox__customer">{{ conversation.customer }}</span>
        <span class="inbox__time">{{ conversation.updated }}</span>
      </span>
      <span slot="description" class="inbox__subject">{{ conversation.subject }}</span>
      <span slot="suffix-icon" class="inbox__marks">
        <c2-badge v-if="conversation.unread" :count="conversation.unread" tone="primary" />
        <c2-badge :tone="STATUS_TONE[conversation.status]" dot />
      </span>
    </c2-list-item>

    <p v-if="!conversations.length" class="inbox__empty">No conversation matches this filter</p>
  </c2-list>
</template>
