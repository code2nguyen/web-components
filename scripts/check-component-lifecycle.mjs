import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function componentSources(root = ROOT) {
  const roots = [path.join(root, 'packages/components'), path.join(root, 'open-packages')]
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
  return node.name && ts.isIdentifier(node.name) ? node.name.text : undefined
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

    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'requestUpdate') {
        findings.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, reason: '`requestUpdate()` inside `firstUpdated()`' })
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        ts.isPropertyAccessExpression(node.left) &&
        node.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
        reactive.has(node.left.name.text)
      ) {
        findings.push({
          file,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          reason: `reactive property \`${node.left.name.text}\` is written inside \`firstUpdated()\``,
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(firstUpdated.body)
  }

  return findings
}

export function analyzeSlotPresenceSource(text, file = 'component.ts') {
  if (!/@slotchange=/.test(text) || !/@state\(\)\s+(?:private\s+|protected\s+)?has[A-Z]/.test(text)) return []
  if (/SlotPresenceController|hasSlottedContent|updateComplete\.then|slot-presence-policy:|initial slot presence|hydration reconciliation/.test(text)) return []
  return [{ file, line: 1, reason: 'reactive slot-presence state relies only on `slotchange` and has no explicit initial/hydration policy' }]
}

export function checkComponentLifecycles(root = ROOT) {
  return componentSources(root).flatMap((absolute) => {
    const file = path.relative(root, absolute)
    const text = fs.readFileSync(absolute, 'utf8')
    return [...analyzeLifecycleSource(text, file), ...analyzeSlotPresenceSource(text, file)]
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = checkComponentLifecycles()
  if (findings.length) {
    console.error(findings.map((finding) => `${finding.file}:${finding.line} ${finding.reason}`).join('\n'))
    process.exitCode = 1
  } else {
    console.log('[lifecycle] first-update and slot-presence policies are clean')
  }
}
