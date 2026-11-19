export const DEVICE_HEADERS = ['id', 'name', 'enabled']

export function normalizeDevices(values) {
  if (!Array.isArray(values) || DEVICE_HEADERS.some((header, index) => values[0]?.[index] !== header)
    || values[0]?.length !== DEVICE_HEADERS.length) throw new Error('devices sheet header mismatch')
  if (values.length > 5001) throw new Error('devices sheet is too large')
  const ids = new Set()
  return values.slice(1).filter((row) => row.some((cell) => cell !== '' && cell != null)).map((row) => {
    const id = String(row[0] ?? '').trim()
    const name = String(row[1] ?? '').trim()
    if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(id) || !name || name.length > 100 || ids.has(id)) {
      throw new Error('invalid or duplicate device in devices sheet')
    }
    ids.add(id)
    if (![true, false, 'TRUE', 'FALSE'].includes(row[2])) throw new Error('invalid enabled flag in devices sheet')
    return { id, name, enabled: row[2] === true || row[2] === 'TRUE' }
  })
}

export function evaluateDevices(devices, latest, thresholdHours, checkedAt) {
  const now = Date.parse(checkedAt)
  if (!Number.isFinite(now) || !Number.isInteger(thresholdHours) || thresholdHours < 1 || thresholdHours > 336) {
    throw new Error('invalid check parameters')
  }
  const byId = new Map(latest.stakes.map((stake) => [stake.id, stake]))
  const rows = []
  for (const device of devices) {
    if (!device.enabled) continue
    const stake = byId.get(device.id)
    const lastReceivedAt = stake?.lastReceivedAt || null
    const ageMs = lastReceivedAt ? now - Date.parse(lastReceivedAt) : null
    let status = '正常'
    if (ageMs === null) status = '未受信'
    else if (!Number.isFinite(ageMs) || ageMs < -5 * 60 * 1000) status = '時刻異常'
    else if (ageMs >= thresholdHours * 60 * 60 * 1000) status = '通信なし・要確認'
    rows.push({ id: device.id, name: device.name, lastReceivedAt,
      elapsedHours: ageMs === null || !Number.isFinite(ageMs) || ageMs < 0 ? null
        : Math.round(ageMs / 36000) / 100,
      thresholdHours, status, alarm: status !== '正常', checkedAt })
  }
  return { checkedAt, thresholdHours, total: rows.length,
    alarms: rows.filter((row) => row.alarm).length, rows }
}

function csvCell(value) {
  let text = String(value ?? '')
  // Opening the CSV in a spreadsheet must not execute device names as formulas.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function makeCsv(result) {
  const columns = ['機器ID', '機器名', '最終通信時刻', '経過時間（時間）', '閾値（時間）', '判定', 'アラーム', '確認実行時刻']
  const lines = result.rows.map((row) => [row.id, row.name, row.lastReceivedAt,
    row.elapsedHours, row.thresholdHours, row.status, row.alarm ? 'ALARM' : '', row.checkedAt]
    .map(csvCell).join(','))
  return `\uFEFF${[columns.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`
}
