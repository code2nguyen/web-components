import assert from 'node:assert/strict'
import test from 'node:test'

import { LogParseError, normalizeId, parseOtlpLogs, severityBand } from '../../lib/otlp.ts'

const request = (records: unknown[], service = 'api') => ({
  resourceLogs: [
    { resource: { attributes: [{ key: 'service.name', value: { stringValue: service } }] }, scopeLogs: [{ scope: { name: 'app' }, logRecords: records }] },
  ],
})

test('reads a camelCase OTLP JSON document and unwraps AnyValue', () => {
  const { records, format } = parseOtlpLogs(
    JSON.stringify(
      request([
        {
          timeUnixNano: '1790000000123456789',
          severityNumber: 17,
          severityText: 'ERROR',
          body: { stringValue: 'boom' },
          traceId: '5b8efff798038103d269b633813fc60c',
          spanId: 'eee19b7ec3c1b174',
          attributes: [
            { key: 'http.status_code', value: { intValue: '502' } },
            { key: 'retry', value: { boolValue: true } },
            { key: 'user', value: { kvlistValue: { values: [{ key: 'id', value: { stringValue: 'u1' } }] } } },
            { key: 'tags', value: { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } } },
          ],
        },
      ]),
    ),
  )
  assert.equal(format, 'otlp-json')
  assert.equal(records.length, 1)
  const [record] = records
  assert.equal(record.service, 'api')
  assert.equal(record.scope, 'app')
  assert.equal(record.severity, 'error')
  assert.equal(record.body, 'boom')
  assert.equal(record.time, 1790000000123.4568)
  assert.equal(record.traceId, '5b8efff798038103d269b633813fc60c')
  assert.deepEqual(record.attributes, { 'http.status_code': 502, retry: true, 'user.id': 'u1', tags: '["a","b"]' })
})

test('reads snake_case fields, observed time fallback and structured bodies', () => {
  const { records } = parseOtlpLogs(
    JSON.stringify({
      resource_logs: [
        {
          resource: { attributes: [] },
          scope_logs: [
            {
              log_records: [
                {
                  observed_time_unix_nano: '1790000000000000000',
                  severity_text: 'warning',
                  body: { kvlistValue: { values: [{ key: 'a', value: { intValue: 1 } }] } },
                },
              ],
            },
          ],
        },
      ],
    }),
  )
  assert.equal(records[0].service, 'unknown_service')
  assert.equal(records[0].severity, 'warn')
  assert.equal(records[0].time, 1790000000000)
  assert.equal(records[0].body, '{"a":1}')
})

test('reads JSON Lines, skips a broken line with a warning and sorts by time', () => {
  const late = request([{ timeUnixNano: '2000000000', body: { stringValue: 'late' } }])
  const early = request([{ timeUnixNano: '1000000000', body: { stringValue: 'early' } }])
  const { records, warnings, format } = parseOtlpLogs(`${JSON.stringify(late)}\n{not json\n${JSON.stringify(early)}\n`)
  assert.equal(format, 'otlp-jsonl')
  assert.deepEqual(
    records.map((record) => record.body),
    ['early', 'late'],
  )
  assert.deepEqual(
    records.map((record) => record.index),
    [0, 1],
  )
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /Line 2/)
})

test('rejects files that are not OpenTelemetry logs', () => {
  assert.throws(() => parseOtlpLogs(''), LogParseError)
  assert.throws(() => parseOtlpLogs('{"hello":1}'), /resourceLogs/)
  assert.throws(() => parseOtlpLogs('plain text\nlines'), LogParseError)
  assert.throws(() => parseOtlpLogs(JSON.stringify(request([]))), /no log records/)
})

test('maps severities from numbers, enum names and text', () => {
  assert.equal(severityBand(21, ''), 'fatal')
  assert.equal(severityBand(9, 'whatever'), 'info')
  assert.equal(severityBand(0, 'Warning'), 'warn')
  assert.equal(severityBand(0, 'CRITICAL'), 'fatal')
  assert.equal(severityBand(0, ''), 'unset')
  const { records } = parseOtlpLogs(JSON.stringify(request([{ timeUnixNano: '1', severityNumber: 'SEVERITY_NUMBER_ERROR2', body: { stringValue: 'x' } }])))
  assert.equal(records[0].severityNumber, 18)
  assert.equal(records[0].severity, 'error')
})

test('normalizes base64 and empty ids', () => {
  assert.equal(normalizeId('W47/95gDgQPSabYzgT/GDA==', 32), '5b8efff798038103d269b633813fc60c')
  assert.equal(normalizeId('00000000000000000000000000000000', 32), '')
  assert.equal(normalizeId(undefined, 16), '')
})
