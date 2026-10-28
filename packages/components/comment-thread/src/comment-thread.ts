import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/avatar'
import '@c2n/relative-time'
import '@c2n/textarea'
import '@c2n/popconfirm'
import '@c2n/reaction-bar'
import type { Reaction, ReactionChangeDetail } from '@c2n/reaction-bar'
import { commentThreadMessages } from './messages'
import styles from './comment-thread.scss?inline'

export { commentThreadMessages } from './messages'

/** Who wrote a comment, or who is writing. */
export interface CommentAuthor {
  /** Matches the current user's `id`; without ids, names are compared. */
  id?: string | number
  name: string
  /** A picture URL; without one the avatar shows initials. */
  avatar?: string
}

/** One comment of the thread. */
export interface ThreadComment {
  id: string | number
  author: CommentAuthor
  /** Plain text: never read as HTML. Line breaks are kept and `@mentions` are highlighted. */
  body: string
  /** When it was written: an ISO date-time, a timestamp or a `Date`. */
  time: string | number | Date
  /** Shows "edited" after the time. */
  edited?: boolean
  /** Its reactions, in `c2-reaction-bar`'s shape. */
  reactions?: Reaction[]
}

/** Events fired by {@link CommentThread}, keyed for `addEventListener`. */
export interface CommentThreadEventMap {
  'comment-add': CustomEvent<{ body: string }>
  'comment-edit': CustomEvent<{ id: string | number; body: string }>
  'comment-delete': CustomEvent<{ id: string | number }>
  'resolve-change': CustomEvent<{ resolved: boolean }>
  'reaction-change': CustomEvent<{ id: string | number } & ReactionChangeDetail>
}

export interface CommentThread {
  addEventListener: TypedAddEventListener<CommentThread, CommentThreadEventMap>
  removeEventListener: TypedRemoveEventListener<CommentThread, CommentThreadEventMap>
}

/** Splits a body into text and `@mention` runs, so mentions can be drawn apart without reading anything as HTML. */
function tokens(body: string): { text: string; mention: boolean }[] {
  const parts: { text: string; mention: boolean }[] = []
  const pattern = /(^|[\s(])(@[\p{L}\p{N}_.-]*[\p{L}\p{N}_])/gu
  let last = 0
  for (const match of body.matchAll(pattern)) {
    const start = (match.index ?? 0) + match[1].length
    if (start > last) parts.push({ text: body.slice(last, start), mention: false })
    parts.push({ text: match[2], mention: true })
    last = start + match[2].length
  }
  if (last < body.length) parts.push({ text: body.slice(last), mention: false })
  return parts
}

let localIds = 0

/**
 * One conversation on a piece of content, like a comment in Google Docs, a review thread on GitHub or a comment pin in
 * Figma: the first comment and its replies, a reply box, edit and delete on your own comments, and Resolve.
 *
 * `comments` lists the thread oldest first: the first is the root, the rest its replies. Each has an `author`, a plain
 * text `body` (line breaks kept, `@mentions` highlighted, never read as HTML), a `time`, and optionally `reactions` for
 * a `c2-reaction-bar` under it (shown with `reactions`). `quote` shows the text the thread is about. `current-user`
 * says who is writing: their own comments can be edited and deleted, and without one the thread is read-only. A thread
 * with more than `collapse-after` replies folds its middle behind "Show N earlier replies"; a `resolved` thread folds
 * down to its first comment.
 *
 * Every change is a cancelable event fired before it is applied: `comment-add`, `comment-edit`, `comment-delete`,
 * `resolve-change` and `reaction-change`. Cancel one to keep the thread controlled (to wait for the server) and set
 * `comments` yourself. An added comment that is not cancelled gets a temporary id (`local-1`). Deleting the first
 * comment only fires `comment-delete`: removing the thread is the app's.
 *
 * @tag c2-comment-thread
 *
 * @event {CustomEvent<{ body: string }>} comment-add - Cancelable. The user sends a reply (the Reply button, or Ctrl/⌘+Enter).
 * @event {CustomEvent<{ id: string | number; body: string }>} comment-edit - Cancelable. The user saves an edited comment.
 * @event {CustomEvent<{ id: string | number }>} comment-delete - Cancelable. The user confirms deleting a comment. Deleting the first one is left to the app.
 * @event {CustomEvent<{ resolved: boolean }>} resolve-change - Cancelable. The user resolves or reopens the thread.
 * @event {CustomEvent<{ id: string | number; emoji: string; reacted: boolean; count: number }>} reaction-change - Cancelable. The user adds or removes a reaction on a comment.
 *
 * @csspart quote - The quoted text the thread is about.
 * @csspart comment - One comment.
 * @csspart author - A comment's author name.
 * @csspart time - A comment's time.
 * @csspart body - A comment's text.
 * @csspart mention - An `@mention` in a comment's text.
 * @csspart action - A small text button (Resolve, Edit, Delete, Show earlier replies).
 * @csspart composer - The reply box with its buttons.
 * @csspart submit - The Reply and Save buttons.
 *
 * @cssproperty {font-size} [--c2-comment-thread--font-size=14px]
 * @cssproperty {color} [--c2-comment-thread--color=#18181b]
 * @cssproperty {color} [--c2-comment-thread--background=#ffffff]
 * @cssproperty {border} [--c2-comment-thread--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-comment-thread--border-radius=8px]
 * @cssproperty {padding} [--c2-comment-thread--padding=12px]
 * @cssproperty {pixel} [--c2-comment-thread--gap=12px] - Space between the comments.
 * @cssproperty {color} [--c2-comment-thread__quote--color=#52525b]
 * @cssproperty {border} [--c2-comment-thread__quote--border=3px solid #f59e0b] - The bar beside the quote.
 * @cssproperty {color} [--c2-comment-thread__quote--background=#fffbeb]
 * @cssproperty {font-weight} [--c2-comment-thread__author--font-weight=600]
 * @cssproperty {color} [--c2-comment-thread__time--color=#71717a]
 * @cssproperty {font-size} [--c2-comment-thread__time--font-size=12px]
 * @cssproperty {color} [--c2-comment-thread__mention--color=#0265dc]
 * @cssproperty {color} [--c2-comment-thread__mention--background=#edf1fe]
 * @cssproperty {color} [--c2-comment-thread__action--color=#52525b]
 * @cssproperty {color} [--c2-comment-thread__action__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-comment-thread__submit--background=#0265dc]
 * @cssproperty {color} [--c2-comment-thread__submit--color=#ffffff]
 * @cssproperty {color} [--c2-comment-thread__resolved--color=#15803d] - The Resolved line and its check.
 * @cssproperty {pixel} [--c2-comment-thread__avatar--size=28px]
 * @cssproperty {outline} [--c2-comment-thread__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-comment-thread')
export class CommentThread extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The thread, oldest first. As an attribute, a JSON array of `{ id, author, body, time, edited?, reactions? }`. */
  @property({ converter: jsonPropertyConverter }) comments: ThreadComment[] = []

  /** Who is writing, as `{ id?, name, avatar? }`. Their comments can be edited and deleted. Without one, the thread is read-only. */
  @property({ attribute: 'current-user', converter: jsonPropertyConverter }) currentUser: CommentAuthor | null = null

  /** The text the thread is about, shown as a quote above the first comment. */
  @property() quote = ''

  /** Whether the thread is resolved: it folds down to its first comment. */
  @property({ type: Boolean, reflect: true }) resolved = false

  /** Shows a reaction bar under each comment. */
  @property({ type: Boolean }) reactions = false

  /** Past this many replies, only the first and the last two show until "Show N earlier replies" is pressed. */
  @property({ type: Number, attribute: 'collapse-after' }) collapseAfter = 4

  /** No reply box, edit, delete or resolve. */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** The accessible name of the thread. */
  @property() label = ''

  @state() private expanded = false
  /** The comment being edited, by id. */
  @state() private editing: string | number | null = null
  @state() private draft = ''
  @state() private editDraft = ''
  @state() private announcement = ''

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, commentThreadMessages)
  private announcementTimer: ReturnType<typeof setTimeout> | undefined

  constructor() {
    super()
    this.internals.role = 'region'
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    clearTimeout(this.announcementTimer)
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.internals.ariaLabel = this.label || this.msg.t('label')
    // A thread that is reopened, or replaced, starts folded again.
    if (changed.has('resolved') && this.resolved) this.expanded = false
  }

  private get list(): ThreadComment[] {
    return (Array.isArray(this.comments) ? this.comments : []).filter((comment) => comment && comment.author && typeof comment.body === 'string')
  }

  private get canWrite(): boolean {
    return !this.readonly && !!this.currentUser?.name
  }

  private isOwn(comment: ThreadComment): boolean {
    const user = this.currentUser
    if (!user?.name) return false
    if (user.id !== undefined && comment.author.id !== undefined) return String(user.id) === String(comment.author.id)
    return user.name === comment.author.name
  }

  private announce(text: string): void {
    clearTimeout(this.announcementTimer)
    this.announcement = ''
    this.announcementTimer = setTimeout(() => (this.announcement = text), 100)
  }

  private fire<K extends keyof CommentThreadEventMap>(type: K, detail: CommentThreadEventMap[K]['detail']): boolean {
    return this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable: true }))
  }

  private async focusSelector(selector: string): Promise<void> {
    await this.updateComplete
    this.renderRoot.querySelector<HTMLElement>(selector)?.focus()
  }

  private submitReply(): void {
    const body = this.draft.trim()
    if (!body || !this.canWrite) return
    if (this.fire('comment-add', { body })) {
      localIds += 1
      const author = this.currentUser!
      this.comments = [...this.list, { id: `local-${localIds}`, author: { ...author }, body, time: new Date().toISOString() }]
    }
    this.draft = ''
    this.announce(this.msg.t('replyAdded'))
    void this.focusSelector('.composer c2-textarea')
  }

  private startEdit(comment: ThreadComment): void {
    this.editing = comment.id
    this.editDraft = comment.body
    void this.focusSelector('.editor c2-textarea')
  }

  private cancelEdit(): void {
    const id = this.editing
    this.editing = null
    void this.focusSelector(`[data-id="${CSS.escape(String(id))}"] .edit`)
  }

  private saveEdit(comment: ThreadComment): void {
    const body = this.editDraft.trim()
    if (!body) return
    if (body !== comment.body && this.fire('comment-edit', { id: comment.id, body })) {
      this.comments = this.list.map((item) => (item.id === comment.id ? { ...item, body, edited: true } : item))
      this.announce(this.msg.t('commentEdited'))
    }
    this.cancelEdit()
  }

  private deleteComment(comment: ThreadComment, root: boolean): void {
    if (!this.fire('comment-delete', { id: comment.id })) return
    // Removing the whole thread is the app's: the first comment stays until the app takes the thread away.
    if (!root) this.comments = this.list.filter((item) => item.id !== comment.id)
    this.announce(this.msg.t('commentDeleted'))
    void this.focusSelector('.composer c2-textarea, .resolve')
  }

  private toggleResolved(): void {
    const resolved = !this.resolved
    if (!this.fire('resolve-change', { resolved })) return
    this.resolved = resolved
    this.announce(this.msg.t(resolved ? 'threadResolved' : 'threadReopened'))
    void this.focusSelector('.resolve')
  }

  private handleReaction(comment: ThreadComment, event: CustomEvent<ReactionChangeDetail>): void {
    event.stopPropagation()
    const detail = { id: comment.id, ...event.detail }
    if (!this.fire('reaction-change', detail)) {
      event.preventDefault()
      return
    }
    this.comments = this.list.map((item) => {
      if (item.id !== comment.id) return item
      const others = (item.reactions ?? []).filter((reaction) => reaction.emoji !== detail.emoji)
      const current = (item.reactions ?? []).find((reaction) => reaction.emoji === detail.emoji)
      const next = detail.count > 0 ? [{ emoji: detail.emoji, count: detail.count, reacted: detail.reacted }] : []
      // Keep the reaction where it was in the row.
      const reactions = current ? (item.reactions ?? []).flatMap((reaction) => (reaction.emoji === detail.emoji ? next : [reaction])) : [...others, ...next]
      return { ...item, reactions }
    })
  }

  /** Inner controls keep their own events: their `input` or field enrolment is not this thread's. */
  private stopInner(event: Event): void {
    event.stopPropagation()
  }

  private renderBody(body: string) {
    return tokens(body).map((part) => (part.mention ? html`<span class="mention" part="mention">${part.text}</span>` : part.text))
  }

  private renderComment(comment: ThreadComment, root: boolean) {
    const own = this.canWrite && this.isOwn(comment)
    const time = comment.time instanceof Date ? comment.time.toISOString() : comment.time
    const timeText = (() => {
      const date = new Date(time)
      return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(this.msg.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    })()
    const name = comment.author.name
    if (this.editing === comment.id) {
      return html`<article class="comment" part="comment" data-id=${String(comment.id)} aria-label=${this.msg.t('commentBy', name, timeText)}>
        <c2-avatar class="avatar" name=${name} src=${comment.author.avatar || nothing} aria-hidden="true"></c2-avatar>
        <div class="main">
          <div class="meta"><span class="author" part="author">${name}</span></div>
          <div class="editor" @c2-field-connect=${this.stopInner} @input=${this.stopInner} @change=${this.stopInner}>
            <c2-textarea
              rows="2"
              aria-label=${this.msg.t('editPlaceholder')}
              .value=${this.editDraft}
              @input=${(event: Event) => (this.editDraft = (event.target as HTMLElement & { value: string }).value)}
              @keydown=${(event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  this.cancelEdit()
                } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  this.saveEdit(comment)
                }
              }}
            ></c2-textarea>
            <div class="buttons">
              <button class="action" part="action" type="button" @click=${() => this.cancelEdit()}>${this.msg.t('cancel')}</button>
              <button class="submit" part="submit" type="button" ?disabled=${!this.editDraft.trim()} @click=${() => this.saveEdit(comment)}>
                ${this.msg.t('save')}
              </button>
            </div>
          </div>
        </div>
      </article>`
    }
    return html`<article class="comment" part="comment" data-id=${String(comment.id)} aria-label=${this.msg.t('commentBy', name, timeText)}>
      <c2-avatar class="avatar" name=${name} src=${comment.author.avatar || nothing} aria-hidden="true"></c2-avatar>
      <div class="main">
        <div class="meta">
          <span class="author" part="author">${name}</span>
          <span class="time" part="time"
            ><c2-relative-time .date=${time} format="short"></c2-relative-time>${comment.edited ? html` · ${this.msg.t('edited')}` : nothing}</span
          >
          <span class="actions">
            ${
              root && !this.readonly && this.currentUser?.name
                ? html`<button class="action resolve" part="action" type="button" @click=${() => this.toggleResolved()}>
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3.2 3L13 4.5" /></svg>${this.msg.t(this.resolved ? 'reopen' : 'resolve')}
                  </button>`
                : nothing
            }
            ${
              own && !this.resolved
                ? html`<button
                      class="action edit"
                      part="action"
                      type="button"
                      aria-label=${this.msg.t('editLabel', name)}
                      @click=${() => this.startEdit(comment)}
                    >
                      ${this.msg.t('edit')}
                    </button>
                    <c2-popconfirm
                      heading=${this.msg.t(root ? 'deleteThreadQuestion' : 'deleteQuestion')}
                      confirm-label=${this.msg.t('delete')}
                      cancel-label=${this.msg.t('cancel')}
                      placement="bottom"
                      @confirm=${() => this.deleteComment(comment, root)}
                    >
                      <button slot="trigger" class="action delete" part="action" type="button" aria-label=${this.msg.t('deleteLabel', name)}>
                        ${this.msg.t('delete')}
                      </button>
                    </c2-popconfirm>`
                : nothing
            }
          </span>
        </div>
        <div class="body" part="body">${this.renderBody(comment.body)}</div>
        ${
          this.reactions
            ? html`<c2-reaction-bar
                .reactions=${comment.reactions ?? []}
                ?readonly=${!this.canWrite}
                @reaction-change=${(event: CustomEvent<ReactionChangeDetail>) => this.handleReaction(comment, event)}
              ></c2-reaction-bar>`
            : nothing
        }
      </div>
    </article>`
  }

  private renderReplies(replies: ThreadComment[]) {
    const limit = Math.max(1, Number.isFinite(this.collapseAfter) ? Math.round(this.collapseAfter) : 4)
    if (this.expanded || replies.length <= limit) return replies.map((reply) => this.renderComment(reply, false))
    const hidden = replies.length - 3
    return html`${this.renderComment(replies[0], false)}
      <button
        class="action more"
        part="action"
        type="button"
        @click=${() => {
          this.expanded = true
          void this.focusSelector(`[data-id="${CSS.escape(String(replies[1].id))}"]`)
        }}
      >
        ${this.msg.t('showEarlier', hidden)}
      </button>
      ${replies.slice(-2).map((reply) => this.renderComment(reply, false))}`
  }

  private renderComposer() {
    if (!this.canWrite || this.resolved) return nothing
    return html`<div class="composer" part="composer" @c2-field-connect=${this.stopInner} @input=${this.stopInner} @change=${this.stopInner}>
      <c2-textarea
        rows="1"
        placeholder=${this.msg.t('replyPlaceholder')}
        aria-label=${this.msg.t('replyPlaceholder')}
        .value=${this.draft}
        @input=${(event: Event) => (this.draft = (event.target as HTMLElement & { value: string }).value)}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            this.submitReply()
          }
        }}
      ></c2-textarea>
      ${
        this.draft
          ? html`<div class="buttons">
              <button class="action" part="action" type="button" @click=${() => (this.draft = '')}>${this.msg.t('cancel')}</button>
              <button class="submit" part="submit" type="button" ?disabled=${!this.draft.trim()} @click=${() => this.submitReply()}>
                ${this.msg.t('reply')}
              </button>
            </div>`
          : nothing
      }
    </div>`
  }

  override render() {
    const [root, ...replies] = this.list
    return html`<div class="thread ${this.resolved ? 'thread--resolved' : ''}">
        ${
          this.quote
            ? html`<blockquote class="quote" part="quote"><span class="visually-hidden">${this.msg.t('quoteLabel')}: </span>${this.quote}</blockquote>`
            : nothing
        }
        ${root ? this.renderComment(root, true) : nothing}
        ${
          this.resolved
            ? html`<div class="resolved-line">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3.2 3L13 4.5" /></svg>${this.msg.t('resolvedLine', replies.length)}
              </div>`
            : this.renderReplies(replies)
        }
        ${this.renderComposer()}
      </div>
      <div class="visually-hidden" role="status">${this.announcement}</div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-comment-thread': CommentThread
  }
}
