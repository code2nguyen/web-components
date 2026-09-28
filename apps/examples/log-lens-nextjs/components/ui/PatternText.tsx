import { WILDCARD } from '@/lib/patterns'

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

/** Story text: backtick spans are pattern templates. */
export function StoryText({ text }: Readonly<{ text: string }>) {
  return (
    <>
      {text
        .split(/(`[^`]+`)/)
        .map((part, index) =>
          part.startsWith('`') && part.endsWith('`') ? (
            <PatternText key={index} className="ll-pattern--inline" template={part.slice(1, -1)} />
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
    </>
  )
}
