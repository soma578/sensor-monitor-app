import { GoogleAuth } from 'google-auth-library'
import { normalizeLatestRows } from './latest.js'

const ROOT = 'https://sheets.googleapis.com/v4/spreadsheets'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

function range(name, cells) {
  return `'${name.replaceAll("'", "''")}'!${cells}`
}

export async function readLatestSheet({ spreadsheetId, latestSheetName,
  credentialsJson, signal, client: injectedClient }) {
  const client = injectedClient || await new GoogleAuth({
    credentials: JSON.parse(credentialsJson), scopes: [SCOPE],
  }).getClient()
  if (signal?.aborted) throw signal.reason
  const url = new URL(`${ROOT}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range(latestSheetName, 'A1:L'))}`)
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE')
  const response = await client.request({ url: url.href, method: 'GET', signal })
  return normalizeLatestRows(response.data?.values || [])
}
