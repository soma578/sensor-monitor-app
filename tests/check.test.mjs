import assert from 'node:assert/strict'
import test from 'node:test'
import { DEVICE_HEADERS, evaluateDevices, makeCsv, normalizeDevices } from '../lib/monitor.js'
import { readMonitorSheets } from '../lib/sheet.js'
import { handlePost } from '../app/api/check/route.js'
import { LATEST_HEADERS } from '../lib/latest.js'

const key = 'operator-key-with-at-least-thirty-two-characters'
const checkedAt = new Date('2026-11-19T12:00:00+09:00')
const devices = normalizeDevices([DEVICE_HEADERS,
  ['A001', '1号杭', true], ['A002', '2号杭', 'TRUE'], ['A003', '=DANGEROUS', true], ['A004', '停止中', false]])
const latest = { stakes: [
  { id: 'A001', lastReceivedAt: '2026-11-19T11:00:00+09:00' },
  { id: 'A002', lastReceivedAt: '2026-11-18T01:00:00+09:00' },
  { id: 'A004', lastReceivedAt: '2026-11-17T00:00:00+09:00' },
] }

test('all registered active devices are checked, including never-received devices', () => {
  const result = evaluateDevices(devices, latest, 30, checkedAt.toISOString())
  assert.equal(result.total, 3)
  assert.equal(result.alarms, 2)
  assert.deepEqual(result.rows.map((row) => row.status), ['正常', '通信なし・要確認', '未受信'])
  assert.equal(result.rows[0].elapsedHours, 1)
  assert.equal(result.rows[1].elapsedHours, 35)
  assert.equal(result.rows[2].lastReceivedAt, null)
  assert.match(makeCsv(result), /"A002","2号杭".*"ALARM"/)
  assert.match(makeCsv(result), /"'=DANGEROUS"/)
})

test('exact threshold alarms and future clock skew is not reported normal', () => {
  const rows = evaluateDevices(devices, { stakes: [
    { id: 'A001', lastReceivedAt: '2026-11-18T06:00:00+09:00' },
    { id: 'A002', lastReceivedAt: '2026-11-20T00:00:00+09:00' },
  ] }, 30, checkedAt.toISOString()).rows
  assert.equal(rows[0].status, '通信なし・要確認')
  assert.equal(rows[1].status, '時刻異常')
  assert.throws(() => evaluateDevices(devices, latest, 0, checkedAt.toISOString()))
})

test('malformed or duplicate device registry is rejected', () => {
  assert.throws(() => normalizeDevices([['deviceId', 'name', 'enabled']]))
  assert.throws(() => normalizeDevices([DEVICE_HEADERS, ['A001', '1号杭', true], ['A001', '重複', true]]))
  assert.throws(() => normalizeDevices([DEVICE_HEADERS, ['A001', '1号杭', 'yes']]))
})

test('sheet reader batch-fetches devices and latest, and validates both headers', async () => {
  const calls = []
  const client = { request: async (operation) => {
    calls.push(operation)
    return { data: { valueRanges: [
      { values: [DEVICE_HEADERS, ['A001', '1号杭', true]] },
      { values: [LATEST_HEADERS, ['A001', '1号杭', 34.5, 133.6, 1, false, true,
        '2026-11-19T11:00:00+09:00', '', 'log-1', '2026-11-19T02:01:00Z', 0]] },
    ] } }
  } }
  const result = await readMonitorSheets({ spreadsheetId: 'test-spreadsheet', devicesSheetName: 'devices',
    latestSheetName: 'latest', client, signal: new AbortController().signal })
  assert.equal(result.devices.length, 1)
  assert.equal(result.latest.stakes[0].lastReceivedAt, '2026-11-19T11:00:00+09:00')
  assert.match(calls[0].url, /valueRenderOption=UNFORMATTED_VALUE/)
  assert.equal(calls[0].method, 'GET')
})

function request({ providedKey = key, thresholdHours = 30, contentType = 'application/json' } = {}) {
  return new Request('https://example.test/api/check', { method: 'POST',
    headers: { 'X-Monitor-Key': providedKey, 'Content-Type': contentType },
    body: JSON.stringify({ thresholdHours }) })
}
const options = { apiKey: key, spreadsheetId: 'test-spreadsheet', credentialsJson: '{}', now: checkedAt,
  read: async () => ({ devices, latest }) }

test('operator key and threshold are required; result is private and downloadable', async () => {
  assert.equal((await handlePost(request({ providedKey: 'wrong' }), options)).status, 401)
  assert.equal((await handlePost(request({ thresholdHours: 0 }), options)).status, 400)
  assert.equal((await handlePost(request({ contentType: 'text/plain' }), options)).status, 415)
  assert.equal((await handlePost(request(), { ...options, apiKey: '' })).status, 503)
  const response = await handlePost(request(), options)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Cache-Control'), /no-store/)
  const body = await response.json()
  assert.equal(body.alarms, 2)
  assert.match(body.csv, /ALARM/)
  assert.equal((await handlePost(request(), { ...options, read: async () => { throw new Error('private') } })).status, 503)
})
