'use client'

import { useState } from 'react'
import styles from './sensor-monitor.module.css'

export default function SensorMonitorPage() {
  const [thresholdHours, setThresholdHours] = useState(30)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function runCheck(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thresholdHours: Number(thresholdHours) }),
      })
      if (!response.ok) {
        throw new Error(response.status === 503 ? 'シートを取得できません。設定または接続を確認してください'
            : '確認を実行できませんでした')
      }
      setResult(await response.json())
    } catch (cause) {
      setError(cause.message)
    } finally {
      setLoading(false)
    }
  }

  function downloadCsv() {
    if (!result) return
    const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mizupigui-communication-check-${result.checkedAt.slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return <main className={styles.shell}>
    <div className={styles.panel}>
      <p className={styles.eyebrow}>水ピィ杭</p>
      <h1>センサー通信確認</h1>
      <p className={styles.intro}>受信済みの水ピィ杭を自動で一覧化し、最終通信時刻を確認します。誰でも確認・CSV出力できます。地図上のアラーム表示は行いません。</p>
      <form onSubmit={runCheck} className={styles.form}>
        <label>通信なしと判定する時間
          <span className={styles.inputWithUnit}><input type="number" min="1" max="336" step="1" value={thresholdHours}
            onChange={(event) => setThresholdHours(event.target.value)} required /><span>時間以上</span></span>
        </label>
        <button type="submit" disabled={loading}>{loading ? '確認中…' : '全機器を確認'}</button>
      </form>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <p className={styles.caution}>一度もデータが届いていない機器は一覧に現れません。「通信なし」は電源断・故障・通信障害のどれかを特定するものではありません。現地確認が必要です。</p>
    </div>
    {result && <section className={styles.panel} aria-live="polite">
      <div className={styles.resultHead}>
        <div><h2>確認結果</h2><p>実行時刻: {new Date(result.checkedAt).toLocaleString('ja-JP')}</p></div>
        <button type="button" onClick={downloadCsv}>CSVをダウンロード</button>
      </div>
      <p className={styles.summary}>受信履歴のある機器 {result.total} 台 · <strong>要確認 {result.alarms} 台</strong></p>
      <div className={styles.tableScroll}><table>
        <thead><tr><th>判定</th><th>機器ID</th><th>機器名</th><th>最終通信</th><th>経過</th></tr></thead>
        <tbody>{result.rows.map((row) => <tr key={row.id}>
          <td><span className={row.alarm ? styles.alarm : styles.normal}>{row.status}</span></td>
          <td>{row.id}</td><td>{row.name}</td>
          <td>{row.lastReceivedAt ? new Date(row.lastReceivedAt).toLocaleString('ja-JP') : '記録なし'}</td>
          <td>{row.elapsedHours == null ? '—' : `${row.elapsedHours} 時間`}</td>
        </tr>)}</tbody>
      </table></div>
      {!result.total && <p>latestに受信履歴のある機器がありません。</p>}
    </section>}
  </main>
}
