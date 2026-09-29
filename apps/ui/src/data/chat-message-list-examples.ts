import type { ChatMessageList } from '@c2n/chat-message-list'

/**
 * Makes the chat room examples live: a `c2-chat-input` inside `[data-chat-demo]` posts into the room's
 * `c2-chat-message-list`, which answers with a streamed reply and loads older history when scrolled to the top.
 */

const replies = [
  'Good question. The list keeps the latest message in view while you read at the bottom.',
  'Scroll up a little and send another message: the list stays where you are and counts what arrived below.',
  'Older history is requested with the load-older event once you reach the top, and prepended without moving the view.',
]

const escape = (text: string) => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char)

function message(text: string, outgoing: boolean): string {
  return outgoing
    ? `<c2-chat-message class="chat-demo-outgoing" align="right"><span slot="title">You</span><div>${escape(text)}</div></c2-chat-message>`
    : `<c2-chat-message><c2-avatar slot="avatar" name="Nova AI" initials="AI"></c2-avatar><span slot="title">Nova</span><div>${escape(text)}</div></c2-chat-message>`
}

function streamReply(list: ChatMessageList, text: string): void {
  list.insertAdjacentHTML('beforeend', message('', false))
  const body = list.lastElementChild?.querySelector('div')
  if (!body) return
  const words = text.split(' ')
  let index = 0
  const timer = setInterval(() => {
    body.textContent = words.slice(0, ++index).join(' ')
    if (index >= words.length) clearInterval(timer)
  }, 60)
}

const seeded = new WeakSet<Element>()

function seedExamples(): void {
  document.querySelectorAll<HTMLElement>('[data-chat-demo]').forEach((room) => {
    const list = room.querySelector<ChatMessageList>('c2-chat-message-list')
    if (!list || seeded.has(room)) return
    seeded.add(room)
    let replyIndex = 0
    let olderPage = 0

    room.addEventListener('submit-message', (event) => {
      const text = (event as CustomEvent<string>).detail.trim()
      if (!text) return
      list.insertAdjacentHTML('beforeend', message(text, true))
      list.scrollToBottom('smooth')
      setTimeout(() => streamReply(list, replies[replyIndex++ % replies.length]), 400)
    })

    list.addEventListener('load-older', () => {
      list.loading = true
      setTimeout(() => {
        olderPage += 1
        const history = Array.from({ length: 4 }, (_, index) =>
          message(`Older message from history page ${olderPage} (${index + 1} of 4).`, index % 2 === 0),
        ).join('')
        list.insertAdjacentHTML('afterbegin', history)
        list.loading = false
        list.hasMore = olderPage < 3
      }, 700)
    })
  })
}

void customElements.whenDefined('c2-chat-message-list').then(() => {
  seedExamples()
  new MutationObserver(seedExamples).observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener('astro:page-load', seedExamples)
})
