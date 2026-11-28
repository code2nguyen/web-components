import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function componentSources(root = ROOT) {
  const roots = [path.join(root, 'packages/components')]
  const files = []
  for (const sourceRoot of roots) walk(sourceRoot, files)
  return files.filter((file) => file.endsWith('.ts') && file.includes(`${path.sep}src${path.sep}`))
}

function walk(directory, files) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(target, files)
    else files.push(target)
  }
}

function memberName(node) {
  // `#helper` too: the components use ECMAScript-private methods as much as `private` ones.
  return node.name && (ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name)) ? node.name.text : undefined
}

function hasDecoratorNamed(node, name, source) {
  const decorators = ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []
  if (
    decorators.some((decorator) => {
      const expression = decorator.expression
      return (ts.isCallExpression(expression) ? expression.expression : expression).getText(source) === name
    })
  )
    return true
  const start = node.getFullStart()
  const text = source.text.slice(start, node.getStart(source))
  return new RegExp(`@${name}\\s*\\(`).test(text)
}

export function analyzeLifecycleSource(text, file = 'component.ts') {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const findings = []

  for (const statement of source.statements) {
    if (!ts.isClassDeclaration(statement)) continue
    const reactive = new Set(
      statement.members
        .filter((member) => ts.isPropertyDeclaration(member) && (hasDecoratorNamed(member, 'state', source) || hasDecoratorNamed(member, 'property', source)))
        .map(memberName)
        .filter(Boolean),
    )
    const firstUpdated = statement.members.find((member) => ts.isMethodDeclaration(member) && memberName(member) === 'firstUpdated')
    if (!firstUpdated?.body) continue
    // Helpers `firstUpdated()` calls synchronously run inside it too: a write moved into one is still a write in it.
    // A helper is a method or a field holding an arrow or function (`private onChange = () => …`). An `async` one is not
    // followed (its writes after the first `await` land after the update; the part before it is a known gap), nor a call
    // made inside a deferred callback (an event handler or a frame runs later).
    const isAsync = (node) => !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    const helpers = new Map()
    for (const member of statement.members) {
      const name = memberName(member)
      if (!name) continue
      if (ts.isMethodDeclaration(member) && member.body && !isAsync(member)) helpers.set(name, member.body)
      const init = ts.isPropertyDeclaration(member) ? member.initializer : undefined
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && !isAsync(init)) helpers.set(name, init.body)
    }
    const followed = new Set(['firstUpdated'])
    // A callback runs later (an event, a frame, `updateComplete.then`), except one an array method calls on the spot.
    const SYNC_CALLERS = new Set([
      ...['forEach', 'map', 'filter', 'flatMap', 'some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex'],
      ...['reduce', 'reduceRight', 'sort', 'toSorted'],
    ])
    // Called on the spot: invoked where it is written, a `new Promise` executor, `Array.from`'s mapper, an array method's callback.
    const runsOnTheSpot = (fn) => {
      let outer = fn
      while (ts.isParenthesizedExpression(outer.parent)) outer = outer.parent
      const call = outer.parent
      if (ts.isCallExpression(call) && call.expression === outer) return true
      if (ts.isNewExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === 'Promise') return call.arguments?.[0] === outer
      if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return false
      const method = call.expression.name.text
      if (method === 'from' && ts.isIdentifier(call.expression.expression) && call.expression.expression.text === 'Array') return call.arguments[1] === outer
      return SYNC_CALLERS.has(method) && call.arguments.includes(outer)
    }
    // A function written here that runs later: a callback, or a method of an object literal (an editor's handlers).
    const isDeferred = (child) =>
      ((ts.isArrowFunction(child) || ts.isFunctionExpression(child)) && (isAsync(child) || !runsOnTheSpot(child))) ||
      ((ts.isMethodDeclaration(child) || ts.isGetAccessor(child) || ts.isSetAccessor(child)) && ts.isObjectLiteralExpression(child.parent))

    const push = (node, what, via) =>
      findings.push({
        file,
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        reason: `${what} inside \`firstUpdated()\``,
        // Printed, not part of the known-list key: which path reaches a helper first depends on call order.
        via: via.length ? `through ${via.map((name) => `\`${name}()\``).join(' → ')}` : undefined,
      })

    const visit = (node, via, inCallback) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
        const name = node.expression.name.text
        if (name === 'requestUpdate' && !inCallback) push(node, '`requestUpdate()`', via)
        const helper = helpers.get(name)
        // A `requestUpdate()` override is the call reported just above, not a helper to walk into.
        if (helper && name !== 'requestUpdate' && !inCallback && !followed.has(name)) {
          followed.add(name)
          visit(helper, [...via, name], false)
        }
      } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'requestUpdate' && !inCallback) {
        push(node, '`requestUpdate()`', via)
      }
      // `this.x = …`, `this.x += …` and `this.x++` / `--this.x` all write `x`.
      const target =
        ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
          ? node.left
          : (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
              (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
            ? node.operand
            : undefined
      if (
        target &&
        !inCallback &&
        ts.isPropertyAccessExpression(target) &&
        target.expression.kind === ts.SyntaxKind.ThisKeyword &&
        reactive.has(target.name.text)
      ) {
        push(node, `reactive property \`${target.name.text}\` is written`, via)
      }
      ts.forEachChild(node, (child) => visit(child, via, inCallback || isDeferred(child)))
    }
    visit(firstUpdated.body, [], false)
  }

  return findings
}

/** The body of the class method `name`, by brace matching from its declaration, or undefined. */
function methodBody(text, name) {
  const declaration = new RegExp(`(?:^|[\\s;{}])(?:(?:private|protected|public|override)\\s+)*${name}\\s*\\([^)]*\\)[^{;]*\\{`).exec(text)
  if (!declaration) return undefined
  let depth = 1
  let index = declaration.index + declaration[0].length
  for (; index < text.length && depth; index++) depth += text[index] === '{' ? 1 : text[index] === '}' ? -1 : 0
  return text.slice(declaration.index + declaration[0].length, index)
}

/**
 * A `SlotReplayController` counts as the slot-presence policy only when it replays slot state: its handler calls a
 * method bound to `@slotchange`, or one that writes a `has…` state. The controller also serves other hydration work
 * (`c2-video-player` reads what the browser supports with it), which says nothing about the slots.
 */
function replaysSlotState(text) {
  const slotHandlers = new Set([...text.matchAll(/@slotchange=\$\{this\.(#?\w+)\}/g)].map((match) => match[1]))
  const replayed = [...text.matchAll(/new SlotReplayController\(\s*this,\s*\(\)\s*=>\s*\{?\s*(?:if \([^)]*\)\s*)?(?:void\s+)?this\.(#?\w+)\(/g)].map(
    (match) => match[1],
  )
  return replayed.some((name) => slotHandlers.has(name) || /this\.has[A-Z]\w*\s*(?:\?\?|\|\||&&)?=(?!=)/.test(methodBody(text, name) ?? ''))
}

export function analyzeSlotPresenceSource(text, file = 'component.ts') {
  if (!/@slotchange=/.test(text) || !/@state\(\)\s+(?:private\s+|protected\s+)?has[A-Z]/.test(text)) return []
  if (/SlotPresenceController|hasSlottedContent|updateComplete\.then|slot-presence-policy:|initial slot presence|hydration reconciliation/.test(text)) return []
  if (replaysSlotState(text)) return []
  return [{ file, line: 1, reason: 'reactive slot-presence state relies only on `slotchange` and has no explicit initial/hydration policy' }]
}

export function checkComponentLifecycles(root = ROOT) {
  return componentSources(root).flatMap((absolute) => {
    // Forward slashes on every platform: the known list is written with them.
    const file = path.relative(root, absolute).split(path.sep).join('/')
    const text = fs.readFileSync(absolute, 'utf8')
    return [...analyzeLifecycleSource(text, file), ...analyzeSlotPresenceSource(text, file)]
  })
}

/** Today's violations, each `<file> <reason>` without its line number (lines move). A ratchet: it only shrinks. */
const KNOWN_FILE = path.join(ROOT, 'scripts/data/lifecycle-known.json')

const key = (finding) => `${finding.file} ${finding.reason}`

/**
 * Compares findings with the known list as multisets (one file can break a rule twice): `added` are violations the list
 * does not cover, `stale` are listed ones that no longer occur, which must leave the list so it cannot hide them again.
 */
export function compareWithKnown(findings, known) {
  const remaining = new Map()
  for (const entry of known) remaining.set(entry, (remaining.get(entry) ?? 0) + 1)
  const added = []
  for (const finding of findings) {
    const count = remaining.get(key(finding)) ?? 0
    if (count) remaining.set(key(finding), count - 1)
    else added.push(finding)
  }
  const stale = [...remaining].flatMap(([entry, count]) => Array(count).fill(entry))
  return { added, stale }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = checkComponentLifecycles()
  const known = JSON.parse(fs.readFileSync(KNOWN_FILE, 'utf8'))
  const { added, stale } = compareWithKnown(findings, known)
  if (added.length) {
    console.error(`[lifecycle] ${added.length} new violation(s) ("Lifecycle" in the root CLAUDE.md):`)
    console.error(added.map((finding) => `  ${finding.file}:${finding.line} ${finding.reason}${finding.via ? ` (${finding.via})` : ''}`).join('\n'))
  }
  if (stale.length) {
    console.error(`[lifecycle] ${stale.length} entry(ies) no longer occur: remove them from scripts/data/lifecycle-known.json`)
    console.error(stale.map((entry) => `  ${entry}`).join('\n'))
  }
  if (added.length || stale.length) process.exitCode = 1
  else if (known.length) console.log(`[lifecycle] no new first-update or slot-presence violations; ${known.length} known one(s) left to fix`)
  else console.log('[lifecycle] first-update and slot-presence policies are clean')
}
