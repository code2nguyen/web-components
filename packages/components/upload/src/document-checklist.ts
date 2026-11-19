import { html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { jsonPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { Upload, type UploadItem, type UploadRejection } from './upload'
import { documentChecklistMessages } from './document-checklist-messages'
import styles from './document-checklist.scss?inline'

/**
 * Where a document stands. `needed`, `uploaded` and `expired` are also worked out by the checklist (a file in the
 * queue, an `expires` date before `today`); `in-review`, `approved` and `rejected` come from the application.
 */
export type DocumentStatus = 'needed' | 'uploaded' | 'in-review' | 'approved' | 'rejected' | 'expired'

/** One expected document: a row of the checklist and the upload target for its files. */
export interface DocumentRequirement {
  /** Unique id. Files added to this row carry it as their `target`. */
  id: string
  /** The document's name. */
  label: string
  /** A line under the name: what qualifies, which pages. */
  description?: string
  /** The status the application knows. Leave it out (or `needed`) to let the checklist work it out. */
  status?: DocumentStatus
  /** Date the document is due, `YYYY-MM-DD`. Shown, and flagged overdue while the document is still needed. */
  due?: string
  /** Date the document on file expires, `YYYY-MM-DD`. Past it, the row is `expired`. */
  expires?: string
  /** Why the document was rejected, shown while the status is `rejected`. */
  reason?: string
  /** Not counted in the summary or by `required`. */
  optional?: boolean
  /** Accepted file types for this row, in the native `accept` syntax. Falls back to the element's `accept`. */
  accept?: string
  /** Takes several files. Without it a new file replaces the row's file. */
  multiple?: boolean
}

/** Context handed to {@link DocumentChecklist.renderActions} for each row. */
export interface DocumentChecklistActionsContext {
  requirement: DocumentRequirement
  /** The row's status, as shown. */
  status: DocumentStatus
  /** The row's files in the queue. */
  items: UploadItem[]
}

/** Draws a row's own actions (view, download a template, request a waiver) beside its upload button. */
export type DocumentChecklistActionsRenderer = (context: DocumentChecklistActionsContext) => unknown

const PROVIDED: readonly DocumentStatus[] = ['uploaded', 'in-review', 'approved']
const LOCKED: readonly DocumentStatus[] = ['in-review', 'approved']

const ICONS: Record<DocumentStatus, string> = {
  needed: '',
  uploaded: 'M12 16V8m-3 3 3-3 3 3',
  'in-review': 'M12 7v5l3 2',
  approved: 'm8 12 3 3 5-6',
  rejected: 'M12 7v6M12 16.5v.5',
  expired: 'M12 7v6M12 16.5v.5',
}

/**
 * A `c2-upload` whose queue is a list of expected documents. Each row is one requirement (proof of identity, three
 * bank statements, a signed contract) with its status, due or expiry date, rejection reason and its own upload
 * target: an upload button and a drop area. A summary counts the required documents provided. Files go through the
 * same `uploadHandler` as `c2-upload`, which receives the row's id as `target`; the application sets each row's
 * review status in `requirements` as its back office decides.
 *
 * `multiple`, `max-files` and `variant` of `c2-upload` do not apply: each row takes one file, or several with its own
 * `multiple`. `required` asks for every non-optional document to be provided.
 *
 * @tag c2-document-checklist
 * @owntemplate
 *
 * @slot header - Replaces the summary at the top.
 * @slot actions - Action zone beside the summary, such as a "Submit for review" button. Hidden when empty.
 * @slot empty - Shown while there are no requirements.
 * @csspart header - The top region wrapping the `header` slot (the summary) and the `actions` slot.
 * @csspart summary - The default summary: count and meter.
 * @csspart actions - The region wrapping the `actions` slot.
 * @csspart rows - The list of requirements.
 * @csspart row - Each requirement row.
 * @csspart status - The status badge of a row.
 * @csspart files - The files of a row.
 * @csspart row-actions - The region of a row holding `renderActions` output and the upload button.
 * @csspart empty - Empty-state boundary exposing the `empty` slot, shown in place of the rows while there are no requirements.
 * @csspart errors - Validation-error status region.
 *
 * @cssproperty {pixel} [--c2-document-checklist--width=640px]
 * @cssproperty {color} [--c2-document-checklist--background=#ffffff]
 * @cssproperty {border} [--c2-document-checklist--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-document-checklist--border-radius=14px]
 * @cssproperty {border} [--c2-document-checklist__divider--border=1px solid #e4e4e7]
 * @cssproperty {padding} [--c2-document-checklist__header--padding=14px 16px]
 * @cssproperty {color} [--c2-document-checklist__summary--color=#18181b]
 * @cssproperty {font-size} [--c2-document-checklist__summary--font-size=14px]
 * @cssproperty {font-weight} [--c2-document-checklist__summary--font-weight=600]
 * @cssproperty {pixel} [--c2-document-checklist__meter--height=6px]
 * @cssproperty {color} [--c2-document-checklist__meter--background=#e4e4e7]
 * @cssproperty {color} [--c2-document-checklist__meter--color=rgb(2, 101, 220)]
 * @cssproperty {padding} [--c2-document-checklist__row--padding=14px 16px]
 * @cssproperty {pixel} [--c2-document-checklist__row--gap=12px]
 * @cssproperty {color} [--c2-document-checklist__row__drag--background=#e8f2ff]
 * @cssproperty {outline} [--c2-document-checklist__row__drag--outline=1px dashed rgb(2, 101, 220)]
 * @cssproperty {pixel} [--c2-document-checklist__icon--size=20px] - Width and height of the icon.
 * @cssproperty {color} [--c2-document-checklist__label--color=#18181b]
 * @cssproperty {font-size} [--c2-document-checklist__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-document-checklist__label--font-weight=600]
 * @cssproperty {color} [--c2-document-checklist__description--color=#71717a]
 * @cssproperty {font-size} [--c2-document-checklist__description--font-size=12px]
 * @cssproperty {color} [--c2-document-checklist__overdue--color=#dc2626]
 * @cssproperty {color} [--c2-document-checklist__reason--color=light-dark(#991b1b, #fecaca)]
 * @cssproperty {padding} [--c2-document-checklist__status--padding=2px 8px]
 * @cssproperty {border-radius} [--c2-document-checklist__status--border-radius=999px]
 * @cssproperty {font-size} [--c2-document-checklist__status--font-size=12px]
 * @cssproperty {font-weight} [--c2-document-checklist__status--font-weight=500]
 * @cssproperty {color} [--c2-document-checklist__status__needed--color=light-dark(#52525b, #d4d4d8)]
 * @cssproperty {color} [--c2-document-checklist__status__needed--background-color=light-dark(#f4f4f5, #27272a)]
 * @cssproperty {color} [--c2-document-checklist__status__uploaded--color=light-dark(#0265dc, #9cc9ff)]
 * @cssproperty {color} [--c2-document-checklist__status__uploaded--background-color=light-dark(#edf1fe, #0f2a4d)]
 * @cssproperty {color} [--c2-document-checklist__status__in-review--color=light-dark(#854d0e, #fde68a)]
 * @cssproperty {color} [--c2-document-checklist__status__in-review--background-color=light-dark(#fef9c3, #3d3210)]
 * @cssproperty {color} [--c2-document-checklist__status__approved--color=light-dark(#166534, #86efac)]
 * @cssproperty {color} [--c2-document-checklist__status__approved--background-color=light-dark(#dcfce7, #14361f)]
 * @cssproperty {color} [--c2-document-checklist__status__rejected--color=light-dark(#991b1b, #fecaca)] - Also the colour of an expired row.
 * @cssproperty {color} [--c2-document-checklist__status__rejected--background-color=light-dark(#fee2e2, #3f1515)] - Also the badge of an expired row.
 * @cssproperty {pixel} [--c2-document-checklist__files--gap=8px]
 * @cssproperty {color} [--c2-document-checklist__error--border-color=#dc2626] - Border colour while an enclosing `c2-form-field` shows an error.
 * @cssproperty {opacity} [--c2-document-checklist__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-upload__error--color=#dc2626] - Colour of the rejected-file messages.
 * @cssproperty {font-size} [--c2-upload__error--font-size=12px]
 * @cssproperty {pixel} [--c2-upload__error--gap=4px]
 * @cssproperty {pixel} [--c2-upload__list--margin-top=12px] - Space above the rejected-file messages.
 *
 * @internalcomponent c2-attachment
 * @internalcomponent c2-button
 */
@customElement('c2-document-checklist')
export class DocumentChecklist extends Upload {
  static override styles = [Upload.styles, unsafeCSS(styles)]

  private readonly strings = new LocalizeController(this, documentChecklistMessages)
  private readonly slots = new SlotPresenceController(this, ['header', 'actions'])
  @state() private activeTarget: string | undefined
  @state() private dragTarget: string | undefined

  /**
   * The expected documents, in order: a JSON array as an attribute, or an array as a property. Assign a new array when
   * a status changes (after review, say); files already in a row's queue stay with that row.
   */
  @property({ converter: jsonPropertyConverter }) requirements: DocumentRequirement[] = []

  /** The date due and expiry dates are compared with, `YYYY-MM-DD`. Defaults to the current local date. */
  @property() today = ''

  /** Draws a row's own actions beside its upload button. */
  @property({ attribute: false }) renderActions: DocumentChecklistActionsRenderer | undefined

  protected override get canAddMore(): boolean {
    return true
  }

  protected override get valueMissing(): boolean {
    return this.required && this.requirementList.some((requirement) => !requirement.optional && !PROVIDED.includes(this.statusOf(requirement.id)))
  }

  protected override get valueMissingText(): string {
    return this.strings.t('valueMissing')
  }

  private get requirementList(): DocumentRequirement[] {
    return Array.isArray(this.requirements) ? this.requirements : []
  }

  private get todayDate(): string {
    if (this.today) return this.today.slice(0, 10)
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  /** The files in a row's queue. */
  itemsFor(id: string): UploadItem[] {
    return this.uploadItems.filter((item) => item.target === id)
  }

  /** A row's status as shown: the application's status, or what the queue and the dates say. */
  statusOf(id: string): DocumentStatus {
    const requirement = this.requirementList.find((candidate) => candidate.id === id)
    if (!requirement) return 'needed'
    let status = requirement.status ?? 'needed'
    if ((status === 'needed' || status === 'approved') && requirement.expires && requirement.expires.slice(0, 10) < this.todayDate) status = 'expired'
    // A new file in the queue answers a missing, rejected or expired document until the application says otherwise.
    if ((status === 'needed' || status === 'rejected' || status === 'expired') && this.itemsFor(id).some((item) => item.status !== 'error')) status = 'uploaded'
    return status
  }

  /** Opens the file browser for one row. */
  async browseFor(id: string): Promise<void> {
    if (this.effectiveDisabled || !this.requirementList.some((requirement) => requirement.id === id)) return
    this.activeTarget = id
    await this.updateComplete
    this.input.click()
  }

  /** Opens the file browser; the files go to the first documents still needed. */
  override browse(): void {
    if (this.activeTarget === undefined) return super.browse()
    // Let the input drop the last row's `accept` and `multiple` before the browser reads them.
    this.activeTarget = undefined
    void this.updateComplete.then(() => super.browse())
  }

  /** Each file is appended to the form data as `<name>[<requirement id>]`. */
  protected override formEntryName(item: UploadItem): string {
    return item.target === undefined ? this.name : `${this.name}[${item.target}]`
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed)
    // A row the application took out takes its files with it: nothing would show them or let them be removed.
    if (changed.has('requirements')) {
      const ids = new Set(this.requirementList.map((requirement) => requirement.id))
      for (const item of this.uploadItems) if (item.target !== undefined && !ids.has(item.target)) this.removeFile(item.id)
    }
  }

  /**
   * Adds files to a row, or, without `id`, each to the first document still needed whose type it matches. A row
   * without `multiple` keeps one file: a new one replaces it.
   */
  override addFiles(files: Iterable<File>, id?: string): UploadItem[] {
    if (this.effectiveDisabled) return []
    const accepted: UploadItem[] = []
    const rejected: UploadRejection[] = []
    const replaced: UploadItem[] = []
    const filled = new Set<string>()
    for (const file of files) {
      const requirement = this.requirementFor(file, id, filled)
      if (!requirement) {
        rejected.push({ file, reason: 'limit', message: this.strings.t('rejectTarget', file.name) })
        continue
      }
      if (LOCKED.includes(this.statusOf(requirement.id))) {
        rejected.push({ file, reason: 'limit', message: this.strings.t('rejectLocked', file.name, requirement.label) })
        continue
      }
      if (!requirement.multiple && filled.has(requirement.id)) {
        rejected.push({ file, reason: 'multiple', message: this.strings.t('rejectOne', file.name) })
        continue
      }
      if (!this.accepts(file, requirement.accept ?? this.accept)) {
        rejected.push({ file, reason: 'type', message: this.strings.t('rejectType', file.name) })
        continue
      }
      if (this.maxSize > 0 && file.size > this.maxSize) {
        rejected.push({ file, reason: 'size', message: this.strings.t('rejectSize', file.name, this.formatBytes(this.maxSize)) })
        continue
      }
      if (!requirement.multiple && !filled.has(requirement.id)) replaced.push(...this.itemsFor(requirement.id))
      filled.add(requirement.id)
      accepted.push(this.createItem(file, requirement.id))
    }
    this.enqueue(accepted, rejected)
    for (const item of replaced) this.removeFile(item.id)
    return accepted
  }

  private requirementFor(file: File, id: string | undefined, filled: Set<string>): DocumentRequirement | undefined {
    if (id !== undefined) return this.requirementList.find((requirement) => requirement.id === id)
    return this.requirementList.find(
      (requirement) =>
        !filled.has(requirement.id) && !PROVIDED.includes(this.statusOf(requirement.id)) && this.accepts(file, requirement.accept ?? this.accept),
    )
  }

  private formatDate(value: string): string {
    const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat(this.strings.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
  }

  private handleChecklistInputChange(event: Event): void {
    event.stopPropagation()
    const input = event.currentTarget as HTMLInputElement
    if (input.files) this.addFiles(input.files, this.activeTarget)
    input.value = ''
  }

  private handleRowDragOver(event: DragEvent, id: string): void {
    if (this.pickerDisabled || LOCKED.includes(this.statusOf(id)) || !event.dataTransfer?.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    this.dragTarget = id
  }

  private handleRowDragLeave(event: DragEvent, id: string): void {
    const row = event.currentTarget as HTMLElement
    if (this.dragTarget === id && !row.contains(event.relatedTarget as Node | null)) this.dragTarget = undefined
  }

  private handleRowDrop(event: DragEvent, id: string): void {
    event.preventDefault()
    this.dragTarget = undefined
    if (this.pickerDisabled || LOCKED.includes(this.statusOf(id)) || !event.dataTransfer?.files.length) return
    this.addFiles(event.dataTransfer.files, id)
  }

  protected override renderInput() {
    const requirement = this.requirementList.find((candidate) => candidate.id === this.activeTarget)
    // The rows' buttons are the controls; the file input only opens the browser for them.
    return html`
      <input
        type="file"
        tabindex="-1"
        aria-hidden="true"
        .accept=${requirement?.accept ?? this.accept}
        ?multiple=${requirement ? !!requirement.multiple : true}
        ?disabled=${this.pickerDisabled}
        @input=${this.stopNativeInput}
        @change=${this.handleChecklistInputChange}
      />
    `
  }

  private renderStatusIcon(status: DocumentStatus) {
    return svg`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" class=${status === 'needed' ? 'icon-ring icon-ring--open' : 'icon-ring'} />${ICONS[status] ? svg`<path d=${ICONS[status]} />` : nothing}</svg>`
  }

  private renderDates(requirement: DocumentRequirement, status: DocumentStatus) {
    const today = this.todayDate
    if (status === 'expired' && requirement.expires)
      return html`<span class="dates dates--alert">${this.strings.t('expiredOn', this.formatDate(requirement.expires))}</span>`
    const lines: unknown[] = []
    if (requirement.due && !PROVIDED.includes(status)) {
      const overdue = requirement.due.slice(0, 10) < today
      lines.push(
        html`<span class=${classMap({ dates: true, 'dates--alert': overdue })}
          >${this.strings.t(overdue ? 'overdue' : 'due', this.formatDate(requirement.due))}</span
        >`,
      )
    }
    if (requirement.expires && requirement.expires.slice(0, 10) >= today)
      lines.push(html`<span class="dates">${this.strings.t('expires', this.formatDate(requirement.expires))}</span>`)
    return lines
  }

  private renderRow(requirement: DocumentRequirement) {
    const status = this.statusOf(requirement.id)
    const items = this.itemsFor(requirement.id)
    const action = items.length ? (requirement.multiple ? 'addFile' : 'replace') : status === 'rejected' || status === 'expired' ? 'replace' : 'upload'
    const actionText = this.strings.t(action)
    const actions = this.renderActions?.({ requirement, status, items })
    return html`
      <li
        part="row"
        class=${classMap({ row: true, 'row--drag': this.dragTarget === requirement.id })}
        data-id=${requirement.id}
        data-status=${status}
        @dragenter=${(event: DragEvent) => this.handleRowDragOver(event, requirement.id)}
        @dragover=${(event: DragEvent) => this.handleRowDragOver(event, requirement.id)}
        @dragleave=${(event: DragEvent) => this.handleRowDragLeave(event, requirement.id)}
        @drop=${(event: DragEvent) => this.handleRowDrop(event, requirement.id)}
      >
        ${this.renderStatusIcon(status)}
        <div class="content">
          <span class="label">${requirement.label}${requirement.optional ? html` <span class="optional">${this.strings.t('optional')}</span>` : nothing}</span>
          ${requirement.description ? html`<span class="description">${requirement.description}</span>` : nothing}
          ${status === 'rejected' && requirement.reason ? html`<span class="reason">${this.strings.t('reason', requirement.reason)}</span>` : nothing}
          ${this.renderDates(requirement, status)}
        </div>
        <div part="row-actions" class="side">
          <span part="status" class="status">${this.strings.t(status)}</span>
          ${actions ?? nothing}
          ${
            LOCKED.includes(status)
              ? nothing
              : html`<c2-button
                  class="row-button"
                  aria-label=${this.strings.t('uploadLabel', actionText, requirement.label)}
                  ?disabled=${this.effectiveDisabled}
                  @click=${() => void this.browseFor(requirement.id)}
                  >${actionText}</c2-button
                >`
          }
        </div>
        ${
          items.length
            ? html`<div part="files" class="files" role="list" aria-label=${this.strings.t('files', requirement.label)}>
                ${items.map(
                  (item) => html`
                    <c2-attachment
                      role="listitem"
                      layout="row"
                      .name=${item.file.name}
                      .type=${item.file.type || undefined}
                      .size=${this.formatBytes(item.file.size)}
                      .status=${item.status}
                      .progress=${item.progress}
                      removable
                      ?disabled=${this.effectiveDisabled}
                      @attachment-remove=${() => this.removeFile(item.id)}
                      @attachment-retry=${() => void this.retry(item.id)}
                    ></c2-attachment>
                  `,
                )}
              </div>`
            : nothing
        }
      </li>
    `
  }

  override render() {
    const required = this.requirementList.filter((requirement) => !requirement.optional)
    const provided = required.filter((requirement) => PROVIDED.includes(this.statusOf(requirement.id))).length
    const ratio = required.length ? provided / required.length : 1
    return html`
      ${this.renderInput()}
      <div class=${classMap({ checklist: true, 'checklist--disabled': this.effectiveDisabled })}>
        <div part="header" class="header" ?hidden=${!required.length && !this.slots.has('header') && !this.slots.has('actions')}>
          <slot name="header" @slotchange=${this.slots.handleSlotChange}>
            ${
              required.length
                ? html`<div part="summary" class="summary">
                    <span class="summary-text">${this.strings.t('summary', provided, required.length)}</span>
                    <span class="meter" aria-hidden="true"><span class="meter-value" style=${styleMap({ inlineSize: `${ratio * 100}%` })}></span></span>
                  </div>`
                : nothing
            }
          </slot>
          <div part="actions" class="actions" ?hidden=${!this.slots.has('actions')}>
            <slot name="actions" @slotchange=${this.slots.handleSlotChange}></slot>
          </div>
        </div>
        ${
          this.requirementList.length
            ? html`<ul
                part="rows"
                class="rows"
                aria-label=${this.ariaLabel || this.field.label || this.strings.t('label')}
                aria-describedby=${this.field.describedBy() || nothing}
                aria-invalid=${this.field.invalid ? 'true' : nothing}
              >
                ${this.requirementList.map((requirement) => this.renderRow(requirement))}
              </ul>`
            : html`<slot part="empty" name="empty"></slot>`
        }
      </div>
      ${this.renderErrors()} ${this.field.renderDescription()}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-document-checklist': DocumentChecklist
  }
}
