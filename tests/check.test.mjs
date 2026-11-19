import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateLatest, makeCsv } from '../lib/monitor.js'
import { readLatestSheet } from '../lib/sheet.js'
import { handlePost } from '../app/api/check/route.js'
import { LATEST_HEADERS, normalizeLatestRows } from '../lib/latest.js'

const checkedAt = new Date('2026-11-19T12:00:00+09:00')
const latest = { stakes: [
  { id: 'A001', name: '1号杭', lastReceivedAt: '2026-11-19T11:00:00+09:00' },
  { id: 'A002', name: '2号杭', lastReceivedAt: '2026-11-18T01:00:00+09:00' },
  { id: 'A003', name: '=DANGEROUS', lastReceivedAt: '2026-11-20T00:00:00+09:00' },
] }

test('every latest row is checked automatically without a devices sheet', () => {
  const result = evaluateLatest(latest, 30, checkedAt.toISOString())
  assert.equal(result.total, 3)
  assert.equal(result.alarms, 2)
  assert.deepEqual(result.rows.map((row) => row.status), ['正常', '通信なし・要確認', '時刻異常'])
  assert.equal(result.rows[0].elapsedHours, 1)
  assert.equal(result.rows[1].elapsedHours, 35)
  assert.match(makeCsv(result), /"A002","2号杭".*"ALARM"/)
  assert.match(makeCsv(result), /"'=DANGEROUS"/)
  assert.equal(evaluateLatest({ stakes: [] }, 30, checkedAt.toISOString()).total, 0)
})

test('exact threshold alarms; invalid threshold is rejected', () => {
  const rows = evaluateLatest({ stakes: [
    { id: 'A001', name: '1号杭', lastReceivedAt: '2026-11-18T06:00:00+09:00' },
  ] }, 30, checkedAt.toISOString()).rows
  assert.equal(rows[0].status, '通信なし・要確認')
  assert.throws(() => evaluateLatest(latest, 0, checkedAt.toISOString()))
})

test('latest sheet header and duplicate IDs are validated', () => {
  const row = ['A001', '1号杭', 34.5, 133.6, 1, false, true,
    '2026-11-19T11:00:00+09:00', '', 'log-1', '2026-11-19T02:01:00Z', 0]
  assert.deepEqual(normalizeLatestRows([LATEST_HEADERS, row]), {
    stakes: [{ id: 'A001', name: '1号杭', lastReceivedAt: row[7] }],
  })
  assert.throws(() => normalizeLatestRows([['bad'], row]), /header/)
  assert.throws(() => normalizeLatestRows([LATEST_HEADERS, row, row]), /duplicate/)
})

test('sheet reader fetches latest only', async () => {
  const calls = []
  const client = { request: async (operation) => {
    calls.push(operation)
    return { data: { values: [LATEST_HEADERS, ['A001', '1号杭', 34.5, 133.6, 1, false, true,
      '2026-11-19T11:00:00+09:00', '', 'log-1', '2026-11-19T02:01:00Z', 0]] } }
  } }
  const result = await readLatestSheet({ spreadsheetId: 'test-spreadsheet', latestSheetName: 'latest',
    client, signal: new AbortController().signal })
  assert.equal(result.stakes.length, 1)
  assert.match(calls[0].url, /valueRenderOption=UNFORMATTED_VALUE/)
  assert.match(decodeURIComponent(calls[0].url), /'latest'!A1:L/)
  assert.equal(calls[0].method, 'GET')
})

function request({ thresholdHours = 30, contentType = 'application/json' } = {}) {
  return new Request('https://example.test/api/check', { method: 'POST',
    headers: { 'Content-Type': contentType }, body: JSON.stringify({ thresholdHours }) })
}
const options = { spreadsheetId: 'test-spreadsheet', credentialsJson: '{}', now: checkedAt,
  read: async () => latest }

test('public check needs no devices configuration and returns CSV', async () => {
  assert.equal((await handlePost(request({ thresholdHours: 0 }), options)).status, 400)
  assert.equal((await handlePost(request({ contentType: 'text/plain' }), options)).status, 415)
  const response = await handlePost(request(), options)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const body = await response.json()
  assert.equal(body.alarms, 2)
  assert.match(body.csv, /ALARM/)
  assert.equal((await handlePost(request(), { ...options, read: async () => { throw new Error('private') } })).status, 503)
})
