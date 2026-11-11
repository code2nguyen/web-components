import { html, nothing, type ReactiveElement } from 'lit'
import type { FilterBuilderLabels, FilterField, FilterGroup, FilterNode, FilterOption, FilterRule } from './filter-types.js'
import { isGroup, operatorLabel, valueText } from './filter-model.js'
import styles from './filter-tree.scss?inline'

/**
 * The tree layout of `c2-filter-builder` (the `groups` attribute): nested AND/OR groups, negation, drag and keyboard
 * moves between groups, a readable sentence and the `then` zone. Loaded with `import()` the first time a builder sets
 * `groups`, so the chip bar does not carry it.
 */

/** English defaults of the text only the tree layout draws. */
export const TREE_LABELS: Required<
  Pick<FilterBuilderLabels, 'or' | 'not' | 'ofTheFollowing' | 'addCondition' | 'addGroup' | 'removeGroup' | 'move' | 'where' | 'then'>
> = {
  or: 'or',
  not: 'not',
  ofTheFollowing: 'of the following',
  addCondition: 'Condition',
  addGroup: 'Group',
  removeGroup: 'Remove group',
  move: 'Move',
  where: 'Where',
  then: 'Then',
}

type Labels = FilterBuilderLabels & typeof TREE_LABELS

/** What the builder hands the tree layout on each render. */
export interface TreeHost {
  /** The complete tree, as in `value`. */
  value: FilterGroup
  /** The working conditions of the root, those still being written included. */
  nodes: FilterNode[]
  fields: FilterField[]
  labels: FilterBuilderLabels
  disabled: boolean
  locale?: string
  renderRule: (rule: FilterRule, path: number[]) => unknown
  options: (field: FilterField, rule: FilterRule) => FilterOption[]
  /** Stores a new working tree; `focus` is a selector in the shadow root to focus once it is drawn. */
  commit: (root: FilterGroup, focus?: string) => void
  /** Opens the field picker that adds a condition to the group at `path`. */
  addRule: (path: number[], anchor: HTMLElement) => void
  shadowRoot: ShadowRoot
}

export interface DescribeOptions {
  fields: FilterField[]
  labels: FilterBuilderLabels
  locale?: string
  options: (field: FilterField, rule: FilterRule) => FilterOption[]
}

const key = (path: number[]) => path.join('.')

/** The tree read as one sentence: `Status is In progress and (Estimate > 5 pts or Blocked is true)`. */
export function describeFilter(tree: FilterGroup, describe: DescribeOptions): string {
  const labels: Labels = { ...TREE_LABELS, ...describe.labels }
  const rule = (node: FilterRule) => {
    const field = describe.fields.find((item) => item.id === node.field)
    if (!field)
      return [node.field, labels.operators[node.operator] ?? node.operator, node.value === undefined ? '' : JSON.stringify(node.value)]
        .filter(Boolean)
        .join(' ')
    const value = valueText(field, node, describe.options(field, node), labels, describe.locale)
    return [field.label, operatorLabel(field, node.operator, labels), value].filter(Boolean).join(' ')
  }
  const group = (node: FilterGroup, nested: boolean): string => {
    const parts = node.rules.map((child) => (isGroup(child) ? group(child, true) : rule(child))).filter(Boolean)
    if (!parts.length) return ''
    const text = parts.join(` ${node.op === 'or' ? labels.or : labels.and} `)
    if (node.not) return `${labels.not} (${text})`
    return nested && parts.length > 1 ? `(${text})` : text
  }
  return group(tree, false)
}

/** Keeps the complete conditions, in groups too; with `dropEmpty` a group left with none goes. */
export function prune(nodes: FilterNode[], complete: (rule: FilterRule) => boolean, dropEmpty: boolean): FilterNode[] {
  return nodes.flatMap((node): FilterNode[] => {
    if (!isGroup(node)) return complete(node) ? [node] : []
    const rules = prune(node.rules, complete, dropEmpty)
    return dropEmpty && !rules.length ? [] : [{ ...node, rules }]
  })
}

function groupAt(root: FilterGroup, path: number[]): FilterGroup | undefined {
  let node: FilterNode | undefined = root
  for (const index of path) node = node && isGroup(node) ? node.rules[index] : undefined
  return node && isGroup(node) ? node : undefined
}

/** A copy of `root` with the group at `path` replaced. */
function withGroup(root: FilterGroup, path: number[], group: FilterGroup): FilterGroup {
  if (!path.length) return group
  const [index, ...rest] = path
  const rules = [...root.rules]
  rules[index] = withGroup(rules[index] as FilterGroup, rest, group)
  return { ...root, rules }
}

/**
 * Moves the node at `from` into the group at `to`, before its child `index` (both read in the tree before the move).
 * Returns the new tree and the node's new path, or `null` when the target is the node itself or inside it.
 */
export function moveNode(root: FilterGroup, from: number[], to: number[], index: number): { root: FilterGroup; path: number[] } | null {
  if (!from.length || (to.length >= from.length && from.every((part, i) => to[i] === part))) return null
  const parent = from.slice(0, -1)
  const position = from[from.length - 1]
  const source = groupAt(root, parent)
  const target = groupAt(root, to)
  const node = source?.rules[position]
  if (!node || !target) return null
  // Insert first, then remove the original, whose path shifts when the insertion lands before it in a shared ancestor.
  let next = withGroup(root, to, { ...target, rules: [...target.rules.slice(0, index), node, ...target.rules.slice(index)] })
  const removal = [...from]
  if (to.every((part, i) => removal[i] === part) && index <= removal[to.length]) removal[to.length]++
  const holder = groupAt(next, removal.slice(0, -1))!
  next = withGroup(next, removal.slice(0, -1), { ...holder, rules: holder.rules.filter((_, i) => i !== removal[removal.length - 1]) })
  const path = [...to, index]
  const depth = parent.length
  if (path.length > depth && parent.every((part, i) => path[i] === part) && position < path[depth]) path[depth]--
  return { root: next, path }
}

/**
 * One keyboard step: past a sibling, into a neighbouring group, or out of the current group at its edge. `null` at
 * the edge of the root.
 */
export function stepNode(root: FilterGroup, path: number[], direction: -1 | 1) {
  const parent = path.slice(0, -1)
  const index = path[path.length - 1]
  const rules = groupAt(root, parent)?.rules ?? []
  const sibling = rules[index + direction]
  if (sibling) {
    if (isGroup(sibling)) return moveNode(root, path, [...parent, index + direction], direction < 0 ? sibling.rules.length : 0)
    return moveNode(root, path, parent, direction < 0 ? index - 1 : index + 2)
  }
  if (!parent.length) return null
  const outer = parent[parent.length - 1]
  return moveNode(root, path, parent.slice(0, -1), direction < 0 ? outer : outer + 1)
}

let sheet: CSSStyleSheet | undefined
/** Where a drag started: the builder's shadow root and the row's path. One drag runs at a time. */
let drag: { root: ShadowRoot; path: number[] } | null = null

const plusIcon = html`<svg slot="prefix-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
  <path d="M12 5v14M5 12h14" />
</svg>`
const gripIcon = html`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <circle cx="9" cy="6" r="1.5" />
  <circle cx="15" cy="6" r="1.5" />
  <circle cx="9" cy="12" r="1.5" />
  <circle cx="15" cy="12" r="1.5" />
  <circle cx="9" cy="18" r="1.5" />
  <circle cx="15" cy="18" r="1.5" />
</svg>`
const crossIcon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
  <path d="M18 6 6 18M6 6l12 12" />
</svg>`

function clearDrop(root: ShadowRoot) {
  for (const element of root.querySelectorAll<HTMLElement>('[data-drop]')) delete element.dataset.drop
}

export function renderTree(host: TreeHost) {
  if (!sheet) {
    sheet = new CSSStyleSheet()
    sheet.replaceSync(styles)
  }
  if (!host.shadowRoot.adoptedStyleSheets.includes(sheet)) host.shadowRoot.adoptedStyleSheets = [...host.shadowRoot.adoptedStyleSheets, sheet]
  const labels: Labels = { ...TREE_LABELS, ...host.labels }
  const element = host.shadowRoot.host as ReactiveElement
  // The working tree: the root's connector and negation from `value`, its conditions as on screen.
  const root: FilterGroup = { ...host.value, rules: host.nodes }
  const sentence = describeFilter(host.value, { fields: host.fields, labels, locale: host.locale, options: host.options })

  const move = (from: number[], to: number[], index: number) => {
    const moved = moveNode(root, from, to, index)
    if (moved) host.commit(moved.root, `.row[data-path="${key(moved.path)}"] > .handle`)
  }

  const drop = (event: DragEvent, to: number[], index: number) => {
    event.preventDefault()
    event.stopPropagation()
    clearDrop(host.shadowRoot)
    const from = drag
    drag = null
    if (from?.root === host.shadowRoot) move(from.path, to, index)
  }

  const nodeName = (node: FilterNode) =>
    isGroup(node)
      ? `${node.not ? `${labels.not} ` : ''}${node.op === 'or' ? labels.any : labels.all} ${labels.ofTheFollowing}`
      : describeFilter({ op: 'and', rules: [node] }, { fields: host.fields, labels, locale: host.locale, options: host.options }) || node.field

  const renderRow = (node: FilterNode, path: number[], op: FilterGroup['op']) => {
    const index = path[path.length - 1]
    const parent = path.slice(0, -1)
    const placement = (event: DragEvent) => {
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
      return event.clientY < box.top + box.height / 2 ? 'before' : 'after'
    }
    return html`<div
      class="row"
      part="row"
      data-path=${key(path)}
      draggable=${host.disabled ? 'false' : 'true'}
      @dragstart=${(event: DragEvent) => {
        event.stopPropagation()
        drag = { root: host.shadowRoot, path }
        event.dataTransfer?.setData('text/plain', nodeName(node))
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      }}
      @dragend=${() => {
        drag = null
        clearDrop(host.shadowRoot)
      }}
      @dragover=${(event: DragEvent) => {
        if (drag?.root !== host.shadowRoot) return
        event.preventDefault()
        event.stopPropagation()
        clearDrop(host.shadowRoot)
        ;(event.currentTarget as HTMLElement).dataset.drop = placement(event)
      }}
      @drop=${(event: DragEvent) => drop(event, parent, placement(event) === 'before' ? index : index + 1)}
    >
      <span class="joiner" aria-hidden="true">${index ? (op === 'or' ? labels.or : labels.and) : labels.where}</span>
      <c2-button
        class="handle"
        aria-label=${`${labels.move} ${nodeName(node)}`}
        aria-keyshortcuts="ArrowUp ArrowDown"
        ?disabled=${host.disabled}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          const moved = stepNode(root, path, event.key === 'ArrowUp' ? -1 : 1)
          if (moved) host.commit(moved.root, `.row[data-path="${key(moved.path)}"] > .handle`)
        }}
        >${gripIcon}</c2-button
      >
      ${isGroup(node) ? renderGroup(node, path) : host.renderRule(node, path)}
    </div>`
  }

  const renderGroup = (group: FilterGroup, path: number[]): unknown => {
    const id = key(path)
    const set = (next: FilterGroup, focus?: string) => host.commit(withGroup(root, path, next), focus)
    const connector = `${group.op === 'or' ? labels.any : labels.all} ${labels.ofTheFollowing}`
    const name = `${group.not ? `${labels.not} ` : ''}${connector}`
    return html`<div
      class=${`group${path.length ? '' : ' is-root'}${group.not ? ' is-negated' : ''}`}
      part="group"
      role="group"
      aria-label=${name}
      data-group=${id}
    >
      <div class="group-head">
        <c2-chip
          class="not"
          selectable
          .selected=${!!group.not}
          ?disabled=${host.disabled}
          @change=${(event: Event) => {
            // The builder reports `filter-change`; a bare `change` from its shadow root would read as its own.
            event.stopPropagation()
            const next: FilterGroup = { ...group }
            if ((event.currentTarget as HTMLElement & { selected: boolean }).selected) next.not = true
            else delete next.not
            set(next)
          }}
          >${labels.not}</c2-chip
        >
        <c2-button
          class="connector"
          ?disabled=${host.disabled}
          @click=${() => set({ ...group, op: group.op === 'or' ? 'and' : 'or' }, `[data-group="${id}"] > .group-head > .connector`)}
          >${connector}</c2-button
        >
        ${
          path.length
            ? html`<c2-button
                class="remove-group"
                aria-label=${`${labels.removeGroup} ${name}`}
                ?disabled=${host.disabled}
                @click=${() => {
                  const parent = path.slice(0, -1)
                  const holder = groupAt(root, parent)!
                  host.commit(
                    withGroup(root, parent, { ...holder, rules: holder.rules.filter((_, i) => i !== path[path.length - 1]) }),
                    `.add-rule[data-path="${key(parent)}"]`,
                  )
                }}
                >${crossIcon}</c2-button
              >`
            : nothing
        }
      </div>
      <div class="rules" part="rules">${group.rules.map((node, index) => renderRow(node, [...path, index], group.op))}</div>
      <div
        class="group-actions"
        @dragover=${(event: DragEvent) => {
          if (drag?.root !== host.shadowRoot) return
          event.preventDefault()
          event.stopPropagation()
          clearDrop(host.shadowRoot)
          ;(event.currentTarget as HTMLElement).dataset.drop = 'end'
        }}
        @drop=${(event: DragEvent) => drop(event, path, group.rules.length)}
      >
        <c2-button
          class="add-rule"
          data-path=${id}
          ?disabled=${host.disabled}
          aria-haspopup="dialog"
          @click=${(event: Event) => host.addRule(path, event.currentTarget as HTMLElement)}
          >${plusIcon}${labels.addCondition}</c2-button
        >
        <c2-button
          class="add-group"
          ?disabled=${host.disabled}
          @click=${() => set({ ...group, rules: [...group.rules, { op: 'and', rules: [] }] }, `.add-rule[data-path="${key([...path, group.rules.length])}"]`)}
          >${plusIcon}${labels.addGroup}</c2-button
        >
      </div>
    </div>`
  }

  return html`<div class="tree" part="tree">
    ${renderGroup(root, [])}
    <p class="sentence" part="sentence" ?hidden=${!sentence}>${sentence}</p>
    <div class="then" part="then" ?hidden=${!element.querySelector(':scope > [slot="then"]')}>
      <span class="joiner">${labels.then}</span>
      <slot name="then" @slotchange=${() => element.requestUpdate()}></slot>
    </div>
  </div>`
}
