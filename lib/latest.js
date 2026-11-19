// This app reads only the ingestion sheet's identity and communication time.
// It intentionally does not import any SVGMap or map API code.
export const LATEST_HEADERS = [
  'id', 'name', 'lat', 'lng', 'waterLevel', 'tiltDetected', 'batteryOk',
  'lastReceivedAt', 'floodedAt', 'logId', 'receivedAt', 'retryCount',
]

export function normalizeLatestRows(values) {
  if (!Array.isArray(values) || values[0]?.length !== LATEST_HEADERS.length
    || LATEST_HEADERS.some((header, index) => values[0][index] !== header)) {
    throw new Error('latest sheet header mismatch')
  }
  if (values.length > 5001) throw new Error('latest sheet is too large')
  const ids = new Set()
  const stakes = values.slice(1).filter((row) => row.some((cell) => cell !== '' && cell != null))
    .map((row) => {
      const id = String(row[0] ?? '').trim()
      const name = String(row[1] ?? '').trim()
      const lastReceivedAt = row[7]
      if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(id) || ids.has(id)
        || !name || name.length > 100
        || typeof lastReceivedAt !== 'string' || !Number.isFinite(Date.parse(lastReceivedAt))) {
        throw new Error('invalid or duplicate latest record')
      }
      ids.add(id)
      return { id, name, lastReceivedAt }
    })
  return { stakes }
}
