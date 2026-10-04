'use client'

import { useRef } from 'react'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'

interface Props {
  status: 'empty' | 'loading' | 'error'
  fileName: string
  error: string
  onFile: (file: File) => void
  onSample: () => void
}

const COLLECTOR_CONFIG = `exporters:
  file:
    path: ./logs.otlp.jsonl   # one OTLP JSON request per line

service:
  pipelines:
    logs:
      receivers: [otlp]
      exporters: [file]`

const LENSES = [
  {
    icon: 'book',
    title: 'Story',
    text: 'The file, written as chapters: when errors surged, what was logged right before, who went quiet, when it recovered.',
  },
  {
    icon: 'layers',
    title: 'Patterns',
    text: 'Thousands of lines are a few dozen kinds of message. See the kinds, their rhythm, and what varies inside each one.',
  },
  {
    icon: 'merge',
    title: 'Journeys',
    text: 'Records stitched by trace id into requests. Failing requests are compared with healthy ones to show where they part ways.',
  },
  {
    icon: 'target',
    title: 'Differences',
    text: 'Which pod, version or attribute do the errors share that the rest of the file does not? Ranked, with the evidence.',
  },
]

function LensIcon({ name }: Readonly<{ name: string }>) {
  if (name === 'book') return <c2-feather-book-open aria-hidden="true" />
  if (name === 'layers') return <c2-feather-layers aria-hidden="true" />
  if (name === 'merge') return <c2-feather-git-merge aria-hidden="true" />
  return <c2-feather-crosshair aria-hidden="true" />
}

export function Landing({ status, fileName, error, onFile, onSample }: Readonly<Props>) {
  const uploadRef = useRef<HTMLElementTagNameMap['c2-upload']>(null)
  useCustomEvent(uploadRef, 'files-selected', (event) => {
    const [file] = event.detail.files
    if (file) onFile(file)
    // The upload is only a picker here: nothing is sent anywhere.
    uploadRef.current?.clear()
  })

  return (
    <main className="ll-landing" id="main">
      <section className="ll-hero" aria-labelledby="hero-title">
        <p className="ll-eyebrow">OpenTelemetry · runs entirely in your browser</p>
        <h1 id="hero-title">Stop scrolling logs. Read what happened.</h1>
        <p className="ll-hero__lead">
          Drop an OTLP log export and Log Lens turns thousands of lines into a short story: the message patterns that make up the file, the moments that
          changed, the requests that failed and exactly how they differ from the ones that did not.
        </p>

        <div className="ll-hero__drop">
          {status === 'loading' ? (
            <c2-card className="ll-loading">
              <c2-progress label={`Reading ${fileName}`}>Reading {fileName}…</c2-progress>
              <p className="ll-muted">Parsing records, mining patterns, stitching traces and writing the story.</p>
            </c2-card>
          ) : (
            <c2-upload ref={uploadRef} className="ll-upload" accept=".json,.jsonl,.ndjson,.log,.txt" aria-label="Open an OpenTelemetry log file">
              <span slot="prompt">Drop an OpenTelemetry log file here, or click to choose one</span>
              <span slot="hint">OTLP JSON or JSON Lines (collector file exporter) · the file never leaves this tab</span>
            </c2-upload>
          )}
          {status === 'error' && (
            <c2-status-panel className="ll-error" status="error" heading={`${fileName} could not be analyzed`} description={error} heading-level={2}>
              <c2-button slot="actions" onClick={onSample}>
                Try the sample instead
              </c2-button>
            </c2-status-panel>
          )}
          <div className="ll-hero__actions">
            <c2-button className="ll-button--primary" onClick={onSample} disabled={status === 'loading'}>
              <c2-feather-zap slot="prefix-icon" />
              Analyze a sample incident
            </c2-button>
            <span className="ll-muted">15 minutes of a shop&apos;s checkout, 6,000 records, one hidden incident.</span>
          </div>
        </div>
      </section>

      <section className="ll-lenses" aria-label="What Log Lens shows">
        {LENSES.map((lens) => (
          <c2-card key={lens.title} className="ll-lens-card">
            <div slot="header" className="ll-lens-card__head">
              <span className="ll-lens-card__icon">
                <LensIcon name={lens.icon} />
              </span>
              <h2>{lens.title}</h2>
            </div>
            <p>{lens.text}</p>
          </c2-card>
        ))}
      </section>

      <section className="ll-formats" aria-labelledby="formats-title">
        <h2 id="formats-title">Getting a file</h2>
        <c2-details label="Export logs from the OpenTelemetry Collector" expanded>
          <p>
            Add a <code>file</code> exporter to the logs pipeline. Every line it writes is an OTLP <code>ExportLogsServiceRequest</code> in JSON, which is
            exactly what Log Lens reads.
          </p>
          <c2-code-viewer className="ll-code" language="yaml" code={COLLECTOR_CONFIG} copyable />
        </c2-details>
        <c2-details label="Which formats are understood?">
          <ul className="ll-list">
            <li>
              A single OTLP JSON document: <code>{'{ "resourceLogs": [...] }'}</code>, e.g. a captured OTLP/HTTP request body.
            </li>
            <li>JSON Lines with one such document per line — the collector file exporter&apos;s default.</li>
            <li>A JSON array of documents.</li>
            <li>camelCase and snake_case field names, all AnyValue types, hex or base64 trace ids, numeric or named severities.</li>
          </ul>
        </c2-details>
        <c2-details label="Is my data uploaded anywhere?">
          <p>No. The file is read and analyzed in this browser tab. Nothing is sent to a server, and closing the tab forgets it.</p>
        </c2-details>
      </section>
    </main>
  )
}
