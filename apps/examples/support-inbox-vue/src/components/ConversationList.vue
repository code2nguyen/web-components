<script setup lang="ts">
import type { ListEventMap } from '@c2n/components/list'
import { MATCH_OPTIONS, STATUS_LABEL, STATUS_TONE, lastActivity, type Conversation } from '../data/conversations'

defineProps<{ conversations: Conversation[]; activeId: string; query: string }>()
const emit = defineEmits<{ select: [id: string] }>()

/**
 * `selection-change` is a kebab-case CustomEvent. Vue registers every `@…` binding on an element with
 * `addEventListener` under the name as written, so it binds by its real name and the event arrives untouched —
 * no synthetic event system in the way and no `on*` spelling to invent, which is the main thing React has to
 * work around.
 *
 * The detail comes typed: `@c2n/components/vue` declares the handler with the component's own event map, so the
 * template binding is checked and there is nothing to cast here.
 */
function handleSelection(event: ListEventMap['selection-change']) {
  const [selected] = event.detail.value
  if (selected) emit('select', selected)
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
      <!-- The status rides on the avatar as a dot. `accessible-label` names it, since a dot has no text of its own;
           the offsets move it from the bounding-box corner onto the round avatar. -->
      <c2-indicator
        slot="prefix-icon"
        class="inbox__status"
        position="bottom-end"
        :tone="STATUS_TONE[conversation.status]"
        :accessible-label="STATUS_LABEL[conversation.status]"
      >
        <c2-avatar auto-color :name="conversation.customer" />
      </c2-indicator>
      <!-- `c2-highlight` marks what the search matched in its own text content, so the text stays Vue's to render.
           `c2-relative-time` takes a `Date` as a property, reads "5 minutes ago" in the page's language and keeps
           itself current: one timer per element, no polling in the app. `min-unit` stops it counting seconds. -->
      <span class="inbox__row">
        <c2-highlight class="inbox__customer" :query="query" :ignore-accents="MATCH_OPTIONS.ignoreAccents">{{ conversation.customer }}</c2-highlight>
        <c2-relative-time class="inbox__time" :date="lastActivity(conversation)" format="narrow" min-unit="minute" />
      </span>
      <c2-highlight slot="description" class="inbox__subject" :query="query" :ignore-accents="MATCH_OPTIONS.ignoreAccents">{{
        conversation.subject
      }}</c2-highlight>
      <span slot="suffix-icon" class="inbox__marks">
        <c2-badge v-if="conversation.unread" :count="conversation.unread" tone="primary" />
      </span>
    </c2-list-item>

    <p v-if="!conversations.length" class="inbox__empty">No conversation matches this filter</p>
  </c2-list>
</template>
