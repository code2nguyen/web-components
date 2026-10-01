import { formatClock, formatNumber } from '@/lib/format'
import { WILDCARD, type Pattern } from '@/lib/patterns'
import { SeverityBadge } from './SeverityBadge'

/** A template with its wildcards drawn as placeholders, so the fixed words read first. */
export function PatternText({ template, slot, className = '' }: Readonly<{ template: string; slot?: string; className?: string }>) {
  const parts = template.split(WILDCARD)
  return (
    <span slot={slot} className={`ll-pattern ${className}`}>
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && (
            <span className="ll-pattern__slot" aria-label="variable">
              ∗
            </span>
          )}
        </span>
      ))}
    </span>
  )
}

/** A pattern named inside a sentence: hover or focus it for a preview card, open it from there. */
function PatternReference({ pattern, template, onOpen }: Readonly<{ pattern?: Pattern; template: string; onOpen?: (id: string) => void }>) {
  if (!pattern) return <PatternText className="ll-pattern--inline" template={template} />
  return (
    <c2-hover-card className="ll-hover" placement="top">
      <span slot="trigger" className="ll-ref" tabIndex={0} aria-label={`Pattern ${pattern.id}: ${pattern.template}`}>
        <PatternText className="ll-pattern--inline" template={template} />
      </span>
      <div className="ll-hover__body">
        <div className="ll-hover__head">
          <SeverityBadge severity={pattern.severity} />
          <strong>{pattern.id}</strong>
          <span className="ll-muted">
            {formatNumber(pattern.count)}× · {pattern.services.join(', ')}
          </span>
        </div>
        <PatternText className="ll-pattern--block" template={pattern.template} />
        <p className="ll-muted">
          First {formatClock(pattern.first)}, last {formatClock(pattern.last)}
          {pattern.slots.length ? ` · varies in ${pattern.slots.map((slot) => slot.label).join(', ')}` : ''}
        </p>
        {onOpen && (
          <c2-button className="ll-button--quiet" onClick={() => onOpen(pattern.id)}>
            Open pattern
          </c2-button>
        )}
      </div>
    </c2-hover-card>
  )
}

/** Story text: `` `P07:template` `` is a pattern reference, `**text**` a highlighted fact. */
export function StoryText({ text, resolve, onOpen }: Readonly<{ text: string; resolve?: (id: string) => Pattern | undefined; onOpen?: (id: string) => void }>) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return (
            <c2-marker key={index} className="ll-mark" variant="highlight">
              {part.slice(2, -2)}
            </c2-marker>
          )
        if (part.startsWith('`') && part.endsWith('`')) {
          const reference = /^(P\d+):([\s\S]*)$/.exec(part.slice(1, -1))
          const template = reference ? reference[2] : part.slice(1, -1)
          return <PatternReference key={index} pattern={reference ? resolve?.(reference[1]) : undefined} template={template} onOpen={onOpen} />
        }
        return <span key={index}>{part}</span>
      })}
    </>
  )
}
