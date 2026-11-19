import { createHash, timingSafeEqual } from 'node:crypto'
import { evaluateDevices, makeCsv } from '../../../lib/monitor.js'
import { readMonitorSheets } from '../../../lib/sheet.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: responseHeaders })

function keyMatches(provided, expected) {
  const a = createHash('sha256').update(provided || '').digest()
  const b = createHash('sha256').update(expected || '').digest()
  return timingSafeEqual(a, b)
}

export async function handlePost(request, options = {}) {
  const apiKey = options.apiKey ?? process.env.SENSOR_MONITOR_API_KEY
  const spreadsheetId = options.spreadsheetId ?? process.env.SENSOR_MONITOR_SHEET_ID
  const devicesSheetName = options.devicesSheetName ?? process.env.SENSOR_MONITOR_DEVICES_SHEET_NAME ?? 'devices'
  const latestSheetName = options.latestSheetName ?? process.env.SENSOR_MONITOR_LATEST_SHEET_NAME ?? 'latest'
  const credentialsJson = options.credentialsJson ?? process.env.SENSOR_MONITOR_GOOGLE_SERVICE_ACCOUNT_JSON
  if (!apiKey || apiKey.length < 32 || !spreadsheetId || !/^[\w-]{10,}$/.test(spreadsheetId)
    || !credentialsJson || !devicesSheetName || !latestSheetName
    || /[\r\n]/.test(devicesSheetName) || /[\r\n]/.test(latestSheetName)) {
    return json(503, { error: 'Monitoring is not configured' })
  }
  if (!keyMatches(request.headers.get('x-monitor-key'), apiKey)) return json(401, { error: 'Unauthorized' })
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type') || '')) {
    return json(415, { error: 'Content-Type must be application/json' })
  }
  let thresholdHours
  try {
    const reader = request.body?.getReader()
    if (!reader) throw new Error('missing body')
    const parts = []
    let bytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 1024) { await reader.cancel(); throw new Error('too large') }
      parts.push(value)
    }
    const body = new Uint8Array(bytes)
    let offset = 0
    for (const part of parts) { body.set(part, offset); offset += part.byteLength }
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
    thresholdHours = payload?.thresholdHours
    if (!Number.isInteger(thresholdHours) || thresholdHours < 1 || thresholdHours > 336) throw new Error('invalid threshold')
  } catch {
    return json(400, { error: 'thresholdHours must be an integer from 1 to 336' })
  }
  const controller = new AbortController()
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Storage timeout')) }, 7500)
  })
  try {
    const read = options.read ?? readMonitorSheets
    const { devices, latest } = await Promise.race([
      read({ spreadsheetId, devicesSheetName, latestSheetName, credentialsJson, signal: controller.signal }), timeout,
    ])
    const result = evaluateDevices(devices, latest, thresholdHours, (options.now ?? new Date()).toISOString())
    return json(200, { ...result, csv: makeCsv(result) })
  } catch (error) {
    console.error('[sensor-monitor] check failed', { reason: error?.message === 'Storage timeout' ? 'timeout' : 'sheets-request' })
    return json(503, { error: 'Monitoring data temporarily unavailable' })
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request) {
  return handlePost(request)
}
