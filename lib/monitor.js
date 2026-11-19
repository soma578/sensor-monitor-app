export function evaluateLatest(latest, thresholdHours, checkedAt) {
  const now = Date.parse(checkedAt)
  if (!Number.isFinite(now) || !Number.isInteger(thresholdHours) || thresholdHours < 1 || thresholdHours > 336) {
    throw new Error('invalid check parameters')
  }
  const rows = []
  for (const stake of latest.stakes) {
    const ageMs = now - Date.parse(stake.lastReceivedAt)
    let status = '正常'
    if (!Number.isFinite(ageMs) || ageMs < -5 * 60 * 1000) status = '時刻異常'
    else if (ageMs >= thresholdHours * 60 * 60 * 1000) status = '通信なし・要確認'
    rows.push({ id: stake.id, name: stake.name, lastReceivedAt: stake.lastReceivedAt,
      elapsedHours: !Number.isFinite(ageMs) || ageMs < 0 ? null
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
