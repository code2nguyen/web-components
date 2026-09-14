<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { SelectEventMap } from '@c2n/select'
import { toast } from '@c2n/toast'
import ConversationList from './components/ConversationList.vue'
import ThreadPanel from './components/ThreadPanel.vue'
import { CONVERSATIONS, STATUS_LABEL, type Conversation, type Status } from './data/conversations'

type Filter = 'all' | Status

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All conversations' },
  { value: 'open', label: 'Open' },
  { value: 'waiting', label: 'Waiting on customer' },
  { value: 'closed', label: 'Closed' },
]

const conversations = ref<Conversation[]>(CONVERSATIONS.map((conversation) => ({ ...conversation, messages: [...conversation.messages] })))
const query = ref('')
const filter = ref<Filter>('all')
const activeId = ref(conversations.value[0].id)
const detailsOpen = ref(false)

const visible = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return conversations.value
    .filter((conversation) => filter.value === 'all' || conversation.status === filter.value)
    .filter((conversation) => !needle || `${conversation.customer} ${conversation.subject}`.toLowerCase().includes(needle))
})

const active = computed(() => conversations.value.find((conversation) => conversation.id === activeId.value) ?? null)
const unread = computed(() => conversations.value.reduce((total, conversation) => total + conversation.unread, 0))

// No cast: the generated Vue types declare `@selection-change` with the detail the component actually fires.
function handleFilter(event: SelectEventMap['selection-change']) {
  const [selected] = event.detail.value
  filter.value = (selected as Filter) ?? 'all'
}

function update(id: string, patch: Partial<Conversation>) {
  conversations.value = conversations.value.map((conversation) => (conversation.id === id ? { ...conversation, ...patch } : conversation))
}

function open(id: string) {
  activeId.value = id
  update(id, { unread: 0 })
}

function reply(body: string) {
  const conversation = active.value
  if (!conversation) return

  update(conversation.id, {
    status: 'waiting',
    updated: 'now',
    messages: [...conversation.messages, { id: `m${conversation.messages.length + 1}`, from: 'agent', author: 'You', body, at: 'now' }],
  })
  toast.show({ variant: 'success', heading: conversation.customer, message: 'Reply sent.' })
}

function resolve() {
  const conversation = active.value
  if (!conversation) return

  update(conversation.id, { status: 'closed', unread: 0 })
  toast.show({ variant: 'success', heading: conversation.id, message: 'Conversation closed.' })
}

/** Archived conversations, keyed by the id `toast.show()` returned, so the Undo action can put them back. */
const archived = new Map<string, { conversation: Conversation; index: number }>()

function archive() {
  const conversation = active.value
  if (!conversation) return

  const index = conversations.value.indexOf(conversation)
  const remaining = conversations.value.filter((candidate) => candidate.id !== conversation.id)
  conversations.value = remaining
  activeId.value = remaining[0]?.id ?? ''

  const id = toast.show({ variant: 'neutral', message: `${conversation.id} archived.`, actionLabel: 'Undo', dismissible: true })
  archived.set(id, { conversation, index })
}

onMounted(() => {
  // `toast.show()` puts its own region on `document.body` — outside the Vue tree — and the region re-emits
  // `toast-action` with the id `show()` handed back. One bubbling listener is therefore all an Undo button
  // needs; there is no per-toast callback to register.
  document.addEventListener('toast-action', (event) => {
    const { id } = (event as CustomEvent<{ id: string }>).detail
    const entry = archived.get(id)
    if (!entry) return

    archived.delete(id)
    const restored = [...conversations.value]
    restored.splice(entry.index, 0, entry.conversation)
    conversations.value = restored
    activeId.value = entry.conversation.id
  })
})
</script>

<template>
  <div class="app">
    <header class="app__head">
      <div>
        <h1>Inbox</h1>
        <p>{{ visible.length }} of {{ conversations.length }} conversations · {{ unread }} unread</p>
      </div>

      <div class="app__controls">
        <!-- `v-model` on a text field: the element exposes `value` and re-emits the inner input's native
             `input` event, which is exactly what Vue's model directive binds to. -->
        <c2-text-field v-model="query" type="search" clearable placeholder="Search customer or subject" aria-label="Search conversations" />

        <!-- The select carries its selection as a `string[]`, so it is written with `.prop` like the list. -->
        <c2-select :value.prop="[filter]" aria-label="Filter by status" fit-size @selection-change="handleFilter">
          <c2-list-item v-for="option in FILTERS" :key="option.value" :value="option.value">{{ option.label }}</c2-list-item>
        </c2-select>
      </div>
    </header>

    <main class="app__body">
      <ConversationList :conversations="visible" :active-id="activeId" @select="open" />

      <ThreadPanel v-if="active" :key="active.id" :conversation="active" @reply="reply" @resolve="resolve" @archive="archive" @details="detailsOpen = true" />
      <section v-else class="thread thread--empty">Pick a conversation on the left.</section>
    </main>

    <!-- `open` is a plain boolean property, so the drawer is driven by state rather than by calling a method on
         an element ref. `close` fires for Escape, the backdrop and the × button alike, which is what keeps the
         state honest when the sheet closes itself. -->
    <c2-sheet :open="detailsOpen" side="right" @close="detailsOpen = false">
      <span slot="title">Customer</span>
      <dl v-if="active" class="details">
        <dt>Name</dt>
        <dd>{{ active.customer }}</dd>
        <dt>Email</dt>
        <dd>{{ active.email }}</dd>
        <dt>Plan</dt>
        <dd>{{ active.plan }}</dd>
        <dt>Status</dt>
        <dd>{{ STATUS_LABEL[active.status] }}</dd>
        <dt>Messages</dt>
        <dd>{{ active.messages.length }}</dd>
      </dl>
      <c2-button slot="footer" class="ghost" @click="detailsOpen = false">Close</c2-button>
    </c2-sheet>
  </div>
</template>
