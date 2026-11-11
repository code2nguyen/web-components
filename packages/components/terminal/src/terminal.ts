import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { isComposingKey } from '@c2n/core/dom-helper.js'
import { terminalMessages } from './messages.js'
import { commonPrefix, parseAnsi, parseArgs } from './terminal-text.js'
import styles from './terminal.scss?inline'

export { parseAnsi, parseArgs } from './terminal-text.js'
export type { TerminalColor, TerminalSpan } from './terminal-text.js'
export { terminalMessages } from './messages.js'

/** How a printed block is coloured. */
export type TerminalOutputKind = 'output' | 'error' | 'success' | 'info'

export interface TerminalPrintOptions {
  kind?: TerminalOutputKind
}

/** What a handler, or a `command` listener, prints with. */
export type TerminalPrint = (value: string | Node, options?: TerminalPrintOptions) => void

/** What a handler is given besides the command line. */
export interface TerminalCommandContext {
  /** The first word: the command's name. */
  name: string
  /** The words after the name, with quotes removed (`deploy "my app"` gives `["my app"]`). */
  args: string[]
  print: TerminalPrint
  /** Aborted when the user presses Ctrl+C. */
  signal: AbortSignal
}

/** What a handler may return: text, a node, a promise of either, or an async iterable of lines, which streams. */
export type TerminalResult = string | Node | void | null | undefined | AsyncIterable<string | Node>
export type TerminalHandler = (command: string, context: TerminalCommandContext) => TerminalResult | Promise<TerminalResult>

/** A command `help` lists. */
export interface TerminalCommand {
  name: string
  description?: string
}

export interface TerminalCommandDetail extends TerminalCommandContext {
  /** The command line as typed, trimmed. */
  command: string
}

/** Events fired by {@link Terminal}, keyed for `addEventListener`. */
export interface TerminalEventMap {
  command: CustomEvent<TerminalCommandDetail>
}

export interface Terminal {
  addEventListener: TypedAddEventListener<Terminal, TerminalEventMap>
  removeEventListener: TypedRemoveEventListener<Terminal, TerminalEventMap>
}

type BlockKind = TerminalOutputKind | 'command' | 'completions' | 'help'

const HISTORY_LIMIT = 1000
/** Output short enough to be read out as it is; anything longer is announced as a line count. */
const ANNOUNCE_LINES = 3
const ANNOUNCE_CHARS = 300

/** Settles a wait raced against Ctrl+C. */
const STOP = Symbol('stop')

/** How many screen lines a printed block holds. */
const linesOf = (block: HTMLElement) => Number(block.dataset.lines ?? 1)

function isAsyncIterable(value: unknown): value is AsyncIterable<string | Node> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

/**
 * An interactive prompt for apps that take commands: dev consoles, CLI tutorials, chat-ops and admin shells. It is
 * not a terminal emulator — there is no PTY and no cursor addressing (use xterm.js for that), and `c2-log-viewer`
 * stays the read-only log.
 *
 * Set `handler` to `(command, { name, args, print, signal }) => …`; it may return a string, a DOM node, a promise of
 * either, or an async iterable of lines, which streams in. Without a handler, listen to `command` and call
 * `print(text, { kind })`, where `kind` is `output`, `error`, `success` or `info`. Strings are always drawn as text,
 * never parsed as HTML; their ANSI colour and bold codes (SGR 30–37, 90–97, 1 and 0) are shown, extended colours
 * (`38;5;n`, `38;2;r;g;b`) fall back to the default colour, and every other escape is dropped. A carriage return starts
 * its line over, and a print that starts with one rewrites the last line printed, so a progress line stays one line.
 *
 * Built in: `clear` (also Ctrl+L) clears the screen, `help` lists `commands` when it is set, and Ctrl+C aborts the
 * running command's `signal`, prints `^C` and gives the prompt back at once, even to a handler that ignores `signal`
 * (whatever it prints later is dropped; with text selected, Ctrl+C copies instead). Tab completes through
 * `complete(input)`, which returns whole command lines: one match fills the line, several are listed under it; with an
 * empty line Tab moves focus as usual. Up and Down walk earlier commands, which `history` reads and sets. While a
 * command runs the prompt gives way to a spinner and typing is ignored; the screen keeps the last `max-lines` lines.
 *
 * The host is a region named by `heading` (or "Terminal"); the command line is a text box named by `label`; the
 * screen is a log that is not live itself — the terminal announces each command's output once it ends, and only a
 * line count when it is long. Clicking the screen focuses the command line unless text was selected. It is dark in
 * both themes, as a terminal reads as one, and every colour is a variable, the eight ANSI colours included.
 *
 * @tag c2-terminal
 *
 * @slot banner - The first lines, above every command: a product name, a welcome, a hint to type `help`.
 * @slot prompt - Shown before the prompt mark on the command line, such as a path and branch. Echoed commands keep its text.
 *
 * @event command - A command was entered (not `clear`, nor `help` while `commands` is set). `detail` is `{ command, name, args, print, signal }`; without a `handler`, print the answer from here.
 *
 * @csspart titlebar - The title bar `heading` adds.
 * @csspart screen - The scrolling screen: banner, output and command line.
 * @csspart prompt - The prompt on the command line.
 * @csspart input - The command line's text box.
 *
 * @cssproperty {length} [--c2-terminal--height=auto] - The terminal's height; the screen scrolls inside it.
 * @cssproperty {length} [--c2-terminal--max-height=420px] - The tallest the terminal grows before its screen scrolls.
 * @cssproperty {color} [--c2-terminal--background-color=#18181b] - Background, dark in both themes.
 * @cssproperty {color} [--c2-terminal--color=#fafafa] - Text colour.
 * @cssproperty {color} [--c2-terminal__muted--color=#a1a1aa] - Secondary text: the title bar, hints, the running line, `help`'s built-ins.
 * @cssproperty {border} [--c2-terminal--border=1px solid #3f3f46] - Border around the terminal.
 * @cssproperty {length} [--c2-terminal--border-radius=8px] - Corner radius.
 * @cssproperty {string} [--c2-terminal--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace] - Font of the screen.
 * @cssproperty {length} [--c2-terminal--font-size=13px] - Font size of the screen.
 * @cssproperty {length} [--c2-terminal--line-height=20px] - Line height of the screen.
 * @cssproperty {length} [--c2-terminal__screen--padding=10px 14px 12px] - Padding of the screen.
 * @cssproperty {color} [--c2-terminal__prompt--color=#7dd3fc] - The prompt mark and the caret.
 * @cssproperty {color} [--c2-terminal__error--color=#f87171] - `error` output and its bar.
 * @cssproperty {color} [--c2-terminal__success--color=#4ade80] - `success` output.
 * @cssproperty {color} [--c2-terminal__info--color=#93c5fd] - `info` output and command names in `help`.
 * @cssproperty {color} [--c2-terminal__selection--background-color=rgba(96, 165, 250, 0.4)] - Selected text.
 * @cssproperty {color} [--c2-terminal__titlebar--background-color=#18181b] - Title bar background.
 * @cssproperty {border} [--c2-terminal__titlebar--border-bottom=1px solid #3f3f46] - Line under the title bar.
 * @cssproperty {length} [--c2-terminal__titlebar--font-size=12px] - Title bar text size.
 * @cssproperty {color} [--c2-terminal__dot--color=#3f3f46] - The three window dots of the title bar.
 * @cssproperty {outline} [--c2-terminal__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Ring while the command line has focus.
 * @cssproperty {color} [--c2-terminal__ansi-black--color=#71717a] - ANSI black (30, 90).
 * @cssproperty {color} [--c2-terminal__ansi-red--color=#f87171] - ANSI red (31, 91).
 * @cssproperty {color} [--c2-terminal__ansi-green--color=#4ade80] - ANSI green (32, 92).
 * @cssproperty {color} [--c2-terminal__ansi-yellow--color=#fbbf24] - ANSI yellow (33, 93).
 * @cssproperty {color} [--c2-terminal__ansi-blue--color=#60a5fa] - ANSI blue (34, 94).
 * @cssproperty {color} [--c2-terminal__ansi-magenta--color=#e879f9] - ANSI magenta (35, 95).
 * @cssproperty {color} [--c2-terminal__ansi-cyan--color=#22d3ee] - ANSI cyan (36, 96).
 * @cssproperty {color} [--c2-terminal__ansi-white--color=#f4f4f5] - ANSI white (37, 97).
 */
@customElement('c2-terminal')
export class Terminal extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The prompt mark shown before each command. */
  @property({ type: String }) prompt = '$'

  /** Accessible name of the command line; "Command" when empty. */
  @property({ type: String }) label = ''

  /** Adds a title bar with this text and the Ctrl+L and Ctrl+C hints, and names the terminal. */
  @property({ type: String }) heading = ''

  /** The most lines the screen keeps; older ones drop off. */
  @property({ type: Number, attribute: 'max-lines' }) maxLines = 5000

  /** The commands `help` lists, `[{ name, description }]`. While it is empty, `help` goes to the handler like any command. */
  @property({ converter: jsonPropertyConverter }) commands: TerminalCommand[] = []

  /** Runs each command. See the class description for what it may return. */
  @property({ attribute: false }) handler?: TerminalHandler

  /** Tab completion: returns the whole command lines the input may complete to. */
  @property({ attribute: false }) complete?: (input: string) => readonly string[] | Promise<readonly string[]>

  /** Earlier commands, oldest first. Set it to restore a session; read it to keep one. */
  @property({ attribute: false }) history: string[] = []

  @state() private running = ''
  @state() private announcement = ''
  @state() private hasPrompt = false

  @query('.input') private input!: HTMLInputElement
  @query('.output') private output!: HTMLElement
  @query('.screen') private screen!: HTMLElement

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, terminalMessages)
  private controller: AbortController | null = null
  /** Set by `run()` from the call until the command starts, so a second call in between is ignored. */
  private claimed = false
  /** The run whose state `running` and `collected` describe. */
  private current: AbortController | null = null
  private historyIndex = -1
  private draft = ''
  private lineCount = 0
  /** Prints made before the first render, drawn once the screen exists. */
  private pending: HTMLElement[] = []
  /** The blocks the running command printed, read for the announcement when it ends. */
  private collected: HTMLElement[] = []
  /**
   * Whether the screen sits at its end, kept by the scroll event so a print reads no layout. While it does, the output
   * growing (a print, or a block drawn late by `content-visibility`) pins it there from a ResizeObserver: one scroll
   * write per frame, after layout, however many prints the frame had.
   */
  private atEnd = true
  private outputObserver?: ResizeObserver

  constructor() {
    super()
    this.internals.role = 'region'
  }

  /** True while a command runs. */
  get busy(): boolean {
    return this.running !== '' || this.claimed
  }

  /**
   * Prints text (ANSI colours kept, drawn as text) or a node, as a block of the given kind. Text that starts with a
   * carriage return rewrites the last line printed when it is of the same kind.
   */
  print(value: string | Node, options: TerminalPrintOptions = {}): void {
    this.addBlock(this.block(value, options.kind ?? 'output'), typeof value === 'string' && /^\r(?!\n)/.test(value))
  }

  /** Clears the screen. The banner stays. */
  clear(): void {
    this.pending = []
    this.output?.replaceChildren()
    this.lineCount = 0
    this.atEnd = true
  }

  /** Runs a command as if it were typed and entered. Ignored while another command runs. */
  async run(command: string): Promise<void> {
    if (this.busy) return
    this.claimed = true
    try {
      await this.updateComplete
    } finally {
      this.claimed = false
    }
    await this.execute(command)
  }

  /** Focuses the command line. */
  override focus(options?: FocusOptions): void {
    if (this.input) this.input.focus(options)
    else super.focus(options)
  }

  protected override willUpdate(_changed: PropertyValues<this>): void {
    // Also follows a language change, which re-renders without a property change.
    this.internals.ariaLabel = this.heading || this.msg.t('terminal')
  }

  override connectedCallback(): void {
    super.connectedCallback()
    // Reconnected: the output exists already and is observed again.
    if (this.hasUpdated) this.observeOutput()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.outputObserver?.disconnect()
  }

  private observeOutput(): void {
    if (typeof ResizeObserver === 'undefined' || !this.output) return
    this.outputObserver ??= new ResizeObserver(() => {
      if (this.atEnd) this.scrollToEnd()
    })
    this.outputObserver.observe(this.output)
  }

  private scrollToEnd(): void {
    if (this.screen) this.screen.scrollTop = this.screen.scrollHeight
  }

  private handleScroll = (): void => {
    const screen = this.screen
    this.atEnd = screen.scrollHeight - screen.scrollTop - screen.clientHeight < 24
  }

  protected override firstUpdated(): void {
    this.observeOutput()
    if (this.pending.length) {
      for (const block of this.pending) this.lineCount += linesOf(block)
      this.output.append(...this.pending)
      this.pending = []
      this.trim()
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    // A lower `max-lines` applies at once, not at the next print.
    if (changed.has('maxLines') && changed.get('maxLines') !== undefined && this.output) this.trim()
  }

  override render() {
    const busy = this.busy
    return html`<div class="terminal">
      ${
        this.heading
          ? html`<div class="titlebar" part="titlebar">
              <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="heading">${this.heading}</span>
              <span class="hints" aria-hidden="true">⌃L ${this.msg.t('clearHint')} · ⌃C ${this.msg.t('cancelHint')}</span>
            </div>`
          : nothing
      }
      <div class="screen" part="screen" @click=${this.handleScreenClick} @scroll=${this.handleScroll}>
        <div class="banner"><slot name="banner"></slot></div>
        <div class="output" role="log" aria-live="off" aria-label=${this.heading || this.msg.t('terminal')}></div>
        ${
          busy
            ? html`<div class="busy">
                <span class="spinner" aria-hidden="true"></span>
                <span>${this.msg.t('running', this.running)} <span class="muted">${this.msg.t('stopHint')}</span></span>
              </div>`
            : nothing
        }
        <div class="input-line ${busy ? 'is-busy' : ''}">
          <span class="prompt" part="prompt"
            ><span class="prompt-slot ${this.hasPrompt ? 'has-content' : ''}"><slot name="prompt" @slotchange=${this.handlePromptSlot}></slot></span
            ><span class="prompt-mark">${this.prompt}</span></span
          >
          <input
            class="input"
            part="input"
            type="text"
            aria-label=${this.label || this.msg.t('command')}
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            enterkeyhint="send"
            ?readonly=${busy}
            @keydown=${this.handleKeydown}
          />
        </div>
      </div>
      <div class="announcement" role="status">${this.announcement}</div>
    </div>`
  }

  // ------------------------------------------------------------------------------------------------- output

  private block(value: string | Node, kind: BlockKind): HTMLElement {
    const block = document.createElement('div')
    block.className = `block ${kind}`
    if (typeof value !== 'string') {
      block.append(value)
      block.dataset.lines = '1'
      return block
    }
    const lines = parseAnsi(value)
    for (const spans of lines) {
      const line = document.createElement('div')
      line.className = 'line'
      for (const span of spans) {
        if (!span.color && !span.bold) {
          line.append(document.createTextNode(span.text))
          continue
        }
        const styled = document.createElement('span')
        styled.textContent = span.text
        if (span.color) styled.classList.add(`ansi-${span.color}`)
        if (span.bold) styled.classList.add('bold')
        line.append(styled)
      }
      block.append(line)
    }
    block.dataset.lines = String(lines.length)
    return block
  }

  private addBlock(block: HTMLElement, rewrite = false): void {
    if (rewrite) this.dropLastLine(block.className)
    if (this.running) this.collected.push(block)
    if (!this.output) {
      this.pending.push(block)
      return
    }
    this.output.append(block)
    this.lineCount += linesOf(block)
    this.trim()
  }

  /**
   * A print that starts with a carriage return rewrites the last line printed, when that line is plain output of the
   * same kind: a progress line streamed as `\rDownloading 10%`, `\rDownloading 20%`… stays one line.
   */
  private dropLastLine(className: string): void {
    const last = (this.output ? this.output.lastElementChild : this.pending[this.pending.length - 1]) as HTMLElement | null | undefined
    const line = last?.className === className ? last.querySelector<HTMLElement>(':scope > .line:last-child') : null
    if (!last || !line) return
    line.remove()
    const left = linesOf(last) - 1
    if (this.output) this.lineCount -= 1
    if (left > 0) last.dataset.lines = String(left)
    else {
      last.remove()
      this.pending = this.pending.filter((block) => block !== last)
      this.collected = this.collected.filter((block) => block !== last)
    }
  }

  /** Drops the oldest lines until no more than `maxLines` are kept. `lineCount` is kept as a running total. */
  private trim(): void {
    const max = Math.max(1, Math.floor(this.maxLines) || 1)
    while (this.lineCount > max && this.output.firstElementChild) {
      const first = this.output.firstElementChild as HTMLElement
      const lines = Number(first.dataset.lines ?? 1)
      if (lines > 1 && first.querySelector(':scope > .line') && this.lineCount - lines < max) {
        // Keep the newest lines of a long block.
        const drop = this.lineCount - max
        for (let i = 0; i < drop; i += 1) first.firstElementChild?.remove()
        first.dataset.lines = String(lines - drop)
        this.lineCount -= drop
      } else {
        first.remove()
        this.lineCount -= lines
      }
    }
  }

  /** The echoed command: the prompt slot's text, the mark and the command. */
  private echo(command: string): HTMLElement {
    const block = document.createElement('div')
    block.className = 'block command'
    block.dataset.lines = '1'
    const context = this.promptText()
    if (context) {
      const span = document.createElement('span')
      span.className = 'prompt-context'
      span.textContent = `${context} `
      block.append(span)
    }
    const mark = document.createElement('span')
    mark.className = 'prompt-mark'
    mark.textContent = this.prompt
    block.append(mark, document.createTextNode(` ${command}`))
    return block
  }

  private promptText(): string {
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot[name="prompt"]')
    return (slot?.assignedNodes({ flatten: true }) ?? [])
      .map((node) => node.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private handlePromptSlot(event: Event): void {
    this.hasPrompt = (event.target as HTMLSlotElement).assignedNodes({ flatten: true }).some((node) => node.nodeType === 1 || node.textContent?.trim())
  }

  private announce(text: string): void {
    // Cleared first, so the same text is announced again.
    this.announcement = ''
    requestAnimationFrame(() => (this.announcement = text))
  }

  // ------------------------------------------------------------------------------------------------- commands

  private async execute(raw: string): Promise<void> {
    const command = raw.trim()
    this.addBlock(this.echo(raw))
    this.historyIndex = -1
    this.draft = ''
    if (!command) return
    if (this.history[this.history.length - 1] !== command) this.history = [...this.history, command].slice(-HISTORY_LIMIT)
    const [name = '', ...args] = parseArgs(command)

    if (name === 'clear') {
      this.clear()
      this.announce(this.msg.t('cleared'))
      return
    }
    if (name === 'help' && this.commands.length) {
      this.addBlock(this.helpBlock())
      return
    }

    const controller = new AbortController()
    this.controller = controller
    this.current = controller
    this.collected = []
    const print: TerminalPrint = (value, options) => {
      if (!controller.signal.aborted) this.print(value, options)
    }
    const context: TerminalCommandContext = { name, args, print, signal: controller.signal }
    this.dispatchEvent(new CustomEvent<TerminalCommandDetail>('command', { detail: { command, ...context } }))
    if (!this.handler) {
      this.controller = null
      return
    }

    this.running = name
    // Ctrl+C ends the command for the terminal at once, even when the handler ignores `signal`: every wait below races
    // the abort, and whatever the abandoned handler prints or yields later is dropped by `print`.
    const stopped = new Promise<typeof STOP>((resolve) => controller.signal.addEventListener('abort', () => resolve(STOP), { once: true }))
    try {
      const pending = Promise.resolve(this.handler(command, context))
      pending.catch(() => undefined)
      const result = await Promise.race([pending, stopped])
      if (result === STOP) return
      if (isAsyncIterable(result)) {
        const iterator = result[Symbol.asyncIterator]()
        for (;;) {
          const step = await Promise.race([iterator.next(), stopped])
          if (step === STOP) {
            iterator.return?.()?.catch(() => undefined)
            break
          }
          if (step.done) break
          print(step.value)
        }
      } else if (result !== undefined && result !== null && !controller.signal.aborted) {
        print(result as string | Node)
      }
    } catch (error) {
      if (!controller.signal.aborted) print(error instanceof Error ? error.message : String(error), { kind: 'error' })
    } finally {
      if (this.controller === controller) this.controller = null
      // A command started after a Ctrl+C has its own run; only this one's state is cleared.
      if (this.current === controller) {
        this.running = ''
        this.current = null
        if (!controller.signal.aborted) this.announceOutput()
        this.collected = []
      }
    }
    await this.updateComplete
    this.atEnd = true
    this.scrollToEnd()
  }

  private announceOutput(): void {
    const lines = this.collected.reduce((sum, block) => sum + Number(block.dataset.lines ?? 1), 0)
    if (!lines) return
    const text = this.collected
      .map((block) => block.textContent ?? '')
      .join('\n')
      .trim()
    this.announce(lines <= ANNOUNCE_LINES && text.length <= ANNOUNCE_CHARS ? text : this.msg.t('outputSummary', lines))
  }

  private cancel(): void {
    const controller = this.controller
    if (!controller) return
    controller.abort()
    this.controller = null
    this.current = null
    this.running = ''
    this.collected = []
    this.print('^C')
    this.announce(this.msg.t('cancelled'))
  }

  private helpBlock(): HTMLElement {
    const block = document.createElement('div')
    block.className = 'block help'
    const rows: [string, string, boolean][] = [
      ...this.commands.map((command): [string, string, boolean] => [command.name, command.description ?? '', false]),
      ['clear', this.msg.t('helpClear'), true],
      ['help', this.msg.t('helpHelp'), true],
    ]
    for (const [name, description, builtIn] of rows) {
      const term = document.createElement('span')
      term.className = 'help-name'
      term.textContent = name
      const text = document.createElement('span')
      if (builtIn) text.className = 'muted'
      text.textContent = description
      block.append(term, text)
    }
    block.dataset.lines = String(rows.length)
    return block
  }

  // ------------------------------------------------------------------------------------------------- keyboard

  private handleKeydown(event: KeyboardEvent): void {
    const input = event.currentTarget as HTMLInputElement
    const ctrl = event.ctrlKey && !event.metaKey && !event.altKey
    const key = event.key.toLowerCase()
    if (ctrl && key === 'l') {
      event.preventDefault()
      this.clear()
      this.announce(this.msg.t('cleared'))
      return
    }
    if (ctrl && key === 'c') {
      // Ctrl+C copies when text is selected: it is the copy shortcut on Windows and Linux.
      const selected = (input.selectionEnd ?? 0) > (input.selectionStart ?? 0) || this.hasSelection()
      if (selected) return
      event.preventDefault()
      if (this.busy) this.cancel()
      else {
        this.addBlock(this.echo(`${input.value}^C`))
        input.value = ''
        this.historyIndex = -1
      }
      return
    }
    if (this.busy) return
    // While an IME composes, Enter confirms the candidate and the arrows and Tab belong to the IME.
    if (isComposingKey(event)) return
    switch (event.key) {
      case 'Enter': {
        event.preventDefault()
        const command = input.value
        input.value = ''
        void this.execute(command)
        return
      }
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!this.history.length) return
        event.preventDefault()
        this.walkHistory(input, event.key === 'ArrowUp' ? -1 : 1)
        return
      }
      case 'Tab': {
        // Tab completes only when there is something to complete; otherwise it moves focus as usual.
        if (!this.complete || !input.value.trim() || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
        event.preventDefault()
        void this.completeInput(input)
        return
      }
    }
  }

  private walkHistory(input: HTMLInputElement, step: number): void {
    if (this.historyIndex === -1) {
      if (step > 0) return
      this.draft = input.value
      this.historyIndex = this.history.length
    }
    const next = this.historyIndex + step
    if (next < 0) return
    if (next >= this.history.length) {
      this.historyIndex = -1
      input.value = this.draft
    } else {
      this.historyIndex = next
      input.value = this.history[next]
    }
    const end = input.value.length
    input.setSelectionRange(end, end)
  }

  private async completeInput(input: HTMLInputElement): Promise<void> {
    const typed = input.value
    const matches = [...((await this.complete?.(typed)) ?? [])].filter((match) => match.startsWith(typed))
    // The input may have changed while the completions were computed.
    if (input.value !== typed || !matches.length) return
    if (matches.length === 1) {
      input.value = matches[0]
    } else {
      const prefix = commonPrefix(matches)
      if (prefix.length > typed.length) input.value = prefix
      this.addBlock(this.echo(typed))
      // Each match is shown from the start of the word being completed.
      const wordStart = typed.lastIndexOf(' ') + 1
      const block = document.createElement('div')
      block.className = 'block completions'
      block.dataset.lines = '1'
      for (const match of matches) {
        const item = document.createElement('span')
        item.textContent = match.slice(wordStart)
        block.append(item)
      }
      this.addBlock(block)
      this.announce(this.msg.t('completions', matches.length))
    }
    const end = input.value.length
    input.setSelectionRange(end, end)
  }

  /**
   * Whether text is selected on the page. Engines report a selection inside a shadow root differently: Chromium on
   * the root's own `getSelection()`, WebKit and Firefox only through `getComposedRanges()` (WebKit's document
   * selection collapses to the host), and a selection outside it on the document.
   */
  private hasSelection(): boolean {
    const root = this.shadowRoot as (ShadowRoot & { getSelection?(): Selection | null }) | null
    if (!(root?.getSelection?.()?.isCollapsed ?? true)) return true
    const selection = window.getSelection() as (Selection & { getComposedRanges?(options: { shadowRoots: ShadowRoot[] }): StaticRange[] }) | null
    if (!selection) return false
    if (root && selection.getComposedRanges) {
      try {
        // Only text selected in the output counts: with the command line focused, its caret is a range too.
        const output = root.querySelector('.output')
        const inOutput = (node: Node) => !!output && output.contains(node)
        const ranges = selection.getComposedRanges({ shadowRoots: [root] })
        if (ranges.some((range) => !range.collapsed && (inOutput(range.startContainer) || inOutput(range.endContainer)))) return true
      } catch {
        // An engine with the older signature (`getComposedRanges(...roots)`) falls back to the document selection.
      }
    }
    return !selection.isCollapsed
  }

  private handleScreenClick(event: MouseEvent): void {
    if (event.target === this.input) return
    // A click that ends a selection keeps it, so the text can be copied.
    if (this.hasSelection()) return
    this.input?.focus({ preventScroll: true })
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-terminal': Terminal
  }
}
