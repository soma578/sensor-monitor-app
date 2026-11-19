import { GoogleAuth } from 'google-auth-library'
import { normalizeLatestRows } from './latest.js'
import { normalizeDevices } from './monitor.js'

const ROOT = 'https://sheets.googleapis.com/v4/spreadsheets'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

function range(name, cells) {
  return `'${name.replaceAll("'", "''")}'!${cells}`
}

export async function readMonitorSheets({ spreadsheetId, devicesSheetName, latestSheetName,
  credentialsJson, signal, client: injectedClient }) {
  const client = injectedClient || await new GoogleAuth({
    credentials: JSON.parse(credentialsJson), scopes: [SCOPE],
  }).getClient()
  if (signal?.aborted) throw signal.reason
  const url = new URL(`${ROOT}/${encodeURIComponent(spreadsheetId)}/values:batchGet`)
  url.searchParams.append('ranges', range(devicesSheetName, 'A1:C'))
  url.searchParams.append('ranges', range(latestSheetName, 'A1:L'))
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE')
  const response = await client.request({ url: url.href, method: 'GET', signal })
  const ranges = response.data?.valueRanges
  if (!Array.isArray(ranges) || ranges.length !== 2) throw new Error('monitor sheet response invalid')
  return { devices: normalizeDevices(ranges[0].values || []),
    latest: normalizeLatestRows(ranges[1].values || []) }
}
